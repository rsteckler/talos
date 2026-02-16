import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedPlugins } from "./loader.js";
import { createLogger } from "../logger/index.js";
import type { PluginHandler } from "./types.js";
import type { PluginManifest } from "@talos/shared/types";

const log = createLogger("plugins");

/** IDs of plugins that are always sent directly to the LLM (not routed). */
export const DIRECT_PLUGIN_IDS = ["datetime", "self", "chat-history", "settings"];

export interface PluginRegistryEntry {
  pluginId: string;
  functionName: string;       // e.g. "turn_on"
  fullName: string;           // e.g. "home-assistant_turn_on"
  description: string;
  paramSummary: string[];     // e.g. ["entity_id (required)", "brightness?"]
  category: string;           // from manifest.category
  keywords: string[];         // tokenized from name + description
}

export interface PluginLookupResult {
  handler: PluginHandler;
  credentials: Record<string, string>;
  manifest: PluginManifest;
  autoAllow: boolean;
}

let registry: PluginRegistryEntry[] = [];

/** Tokenize a string into lowercase keywords for matching. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_/,.;:()]+/)
    .filter((t) => t.length > 1);
}

/** Build param summary strings from a JSON Schema parameters object. */
function buildParamSummary(parameters: Record<string, unknown>): string[] {
  const properties = (parameters["properties"] ?? {}) as Record<string, Record<string, unknown>>;
  const required = (parameters["required"] ?? []) as string[];
  const summary: string[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const desc = typeof prop["description"] === "string" ? prop["description"] : "";
    const shortDesc = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
    summary.push(isRequired ? `${key} (required)${shortDesc ? " — " + shortDesc : ""}` : `${key}?${shortDesc ? " — " + shortDesc : ""}`);
  }

  return summary;
}

/**
 * Rebuild the in-memory registry of routed tool functions.
 * Called after all plugins are loaded. Only indexes enabled, non-direct plugins
 * that have their required credentials configured.
 */
export function rebuildRegistry(): void {
  const loadedPlugins = getLoadedPlugins();
  const entries: PluginRegistryEntry[] = [];

  for (const [pluginId, loaded] of loadedPlugins) {
    // Skip direct plugins — they're sent to the LLM directly
    if (DIRECT_PLUGIN_IDS.includes(pluginId)) continue;

    // Check if plugin is enabled
    const configRow = db
      .select()
      .from(schema.pluginConfigs)
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .get();

    if (!configRow?.isEnabled) continue;

    // Check required credentials
    const storedConfig: Record<string, string> = configRow.config
      ? (JSON.parse(configRow.config) as Record<string, string>)
      : {};
    const requiredCreds = loaded.manifest.credentials?.filter((c) => c.required) ?? [];
    const missingCreds = requiredCreds.filter((c) => !storedConfig[c.name]);
    if (missingCreds.length > 0) continue;

    // Check OAuth
    if (loaded.manifest.oauth && !storedConfig["refresh_token"]) continue;

    const category = loaded.manifest.category ?? "other";

    for (const fnSpec of loaded.manifest.functions) {
      const fullName = `${pluginId}_${fnSpec.name}`;
      const keywords = [
        ...tokenize(pluginId),
        ...tokenize(fnSpec.name),
        ...tokenize(fnSpec.description),
        ...tokenize(loaded.manifest.name),
        ...tokenize(category),
      ];

      entries.push({
        pluginId,
        functionName: fnSpec.name,
        fullName,
        description: fnSpec.description,
        paramSummary: buildParamSummary(fnSpec.parameters),
        category,
        keywords: [...new Set(keywords)],
      });
    }
  }

  registry = entries;
  log.dev.debug(`Plugin registry rebuilt: ${entries.length} routed functions`);
}

/**
 * Search the registry for tool functions matching a query.
 * Uses simple keyword overlap scoring.
 */
export function searchRegistry(
  query: string,
  category?: string,
  limit = 10,
): Array<{ name: string; description: string; params: string[]; category: string }> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  let candidates = registry;
  if (category) {
    candidates = candidates.filter((e) => e.category === category);
  }

  const scored = candidates.map((entry) => {
    let score = 0;
    for (const qt of queryTokens) {
      // Exact keyword match
      if (entry.keywords.includes(qt)) {
        score += 1;
      }
      // Partial match (substring)
      for (const kw of entry.keywords) {
        if (kw !== qt && (kw.includes(qt) || qt.includes(kw))) {
          score += 0.5;
          break;
        }
      }
      // Boost for match in fullName
      if (entry.fullName.toLowerCase().includes(qt)) {
        score += 0.5;
      }
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      name: s.entry.fullName,
      description: s.entry.description,
      params: s.entry.paramSummary,
      category: s.entry.category,
    }));
}

/**
 * Look up a specific tool function by its full name (e.g. "home-assistant_turn_on").
 * Returns the handler, credentials, and manifest needed to execute it.
 */
export function lookupFunction(fullName: string): PluginLookupResult | null {
  const entry = registry.find((e) => e.fullName === fullName);
  if (!entry) return null;

  const loadedPlugins = getLoadedPlugins();
  const loaded = loadedPlugins.get(entry.pluginId);
  if (!loaded) return null;

  const handler = loaded.handlers[entry.functionName];
  if (!handler) return null;

  const configRow = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, entry.pluginId))
    .get();

  if (!configRow?.isEnabled) return null;

  const credentials: Record<string, string> = configRow.config
    ? (JSON.parse(configRow.config) as Record<string, string>)
    : {};

  return {
    handler,
    credentials,
    manifest: loaded.manifest,
    autoAllow: !!configRow.allowWithoutAsking,
  };
}

/**
 * Generate a compact text catalog of all routed tools, grouped by category.
 * Used in the system prompt so the LLM knows what extended tools are available.
 *
 * Intentionally omits function names and plugin IDs to prevent models from
 * constructing direct tool calls. Only display names are shown.
 */
export function getPluginCatalog(): string {
  // Collect unique plugin display names per category
  const pluginsByCategory = new Map<string, Set<string>>();

  for (const entry of registry) {
    if (!pluginsByCategory.has(entry.category)) {
      pluginsByCategory.set(entry.category, new Set());
    }
    const loaded = getLoadedPlugins().get(entry.pluginId);
    const displayName = loaded?.manifest.name ?? entry.pluginId;
    pluginsByCategory.get(entry.category)!.add(displayName);
  }

  if (pluginsByCategory.size === 0) return "";

  const lines = [
    "## Available Extended Tools",
    "",
    "You have access to the tools below via `plan_actions`.",
    "",
  ];

  for (const [category, names] of pluginsByCategory) {
    lines.push(`- **${category}**: ${[...names].join(" · ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Module catalog (for plan-then-execute architecture)
// ---------------------------------------------------------------------------

/** Module reference used by the planner. */
export interface ModuleCatalogEntry {
  moduleRef: string;     // "google:gmail", "todoist:todoist"
  name: string;          // "Gmail"
  service: string;       // "Google Workspace"
  description: string;
  category: string;
}

/**
 * Get the full module catalog for the planner system prompt.
 * Plugins with explicit modules are split into entries per module.
 * Plugins without modules get a single implicit module using the plugin's name/description.
 */
export function getModuleCatalog(): ModuleCatalogEntry[] {
  // Collect plugin IDs that are actually in the registry (enabled + credentialed)
  const activePluginIds = new Set<string>();
  for (const entry of registry) {
    activePluginIds.add(entry.pluginId);
  }

  const loadedPlugins = getLoadedPlugins();
  const catalog: ModuleCatalogEntry[] = [];

  for (const pluginId of activePluginIds) {
    const loaded = loadedPlugins.get(pluginId);
    if (!loaded) continue;

    const category = loaded.manifest.category ?? "other";
    const service = loaded.manifest.name;

    if (loaded.manifest.modules && loaded.manifest.modules.length > 0) {
      for (const mod of loaded.manifest.modules) {
        // Only include modules that have at least one function in the registry
        const hasRegisteredFunction = mod.functions.some(
          (fn) => registry.some((e) => e.pluginId === pluginId && e.functionName === fn),
        );
        if (!hasRegisteredFunction) continue;

        catalog.push({
          moduleRef: `${pluginId}:${mod.id}`,
          name: mod.name,
          service,
          description: mod.description,
          category,
        });
      }
    } else {
      // Implicit single module
      catalog.push({
        moduleRef: `${pluginId}:${pluginId}`,
        name: service,
        service,
        description: loaded.manifest.description,
        category,
      });
    }
  }

  return catalog;
}

/**
 * Get function names for a specific module ref (e.g. "google:gmail").
 * Returns full names (e.g. "google_gmail_search") for building tool sets.
 */
export function getModuleFunctions(moduleRef: string): string[] | null {
  const [pluginId, moduleId] = moduleRef.split(":");
  if (!pluginId || !moduleId) return null;

  const loadedPlugins = getLoadedPlugins();
  const loaded = loadedPlugins.get(pluginId);
  if (!loaded) return null;

  if (loaded.manifest.modules && loaded.manifest.modules.length > 0) {
    const mod = loaded.manifest.modules.find((m) => m.id === moduleId);
    if (!mod) return null;
    // Return only functions that exist in the registry (credentialed + enabled)
    return mod.functions
      .map((fn) => `${pluginId}_${fn}`)
      .filter((fullName) => registry.some((e) => e.fullName === fullName));
  }

  // Implicit module — return all functions for this plugin
  if (moduleId === pluginId) {
    return registry
      .filter((e) => e.pluginId === pluginId)
      .map((e) => e.fullName);
  }

  return null;
}

/**
 * Format the module catalog as compact text for the LLM system prompt.
 * Includes the moduleRef so the planner can reference modules correctly.
 */
export function formatModuleCatalog(entries: ModuleCatalogEntry[]): string {
  if (entries.length === 0) return "";

  const lines: string[] = [];
  for (const entry of entries) {
    // Show service name in parens if it differs from the module name
    const serviceTag = entry.name !== entry.service ? ` (${entry.service})` : "";
    lines.push(`- \`${entry.moduleRef}\` — ${entry.name}${serviceTag}: ${entry.description}`);
  }

  return lines.join("\n");
}

/** Get distinct categories with function counts. */
export function getCategories(): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of registry) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
