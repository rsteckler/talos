import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedTools } from "./loader.js";
import { createLogger } from "../logger/index.js";
import type { ToolHandler } from "./types.js";
import type { ToolManifest } from "@talos/shared/types";

const log = createLogger("tools");

/** IDs of tools that are always sent directly to the LLM (not routed). */
export const DIRECT_TOOL_IDS = ["datetime", "self", "chat-history", "settings"];

export interface ToolRegistryEntry {
  toolId: string;
  functionName: string;       // e.g. "turn_on"
  fullName: string;           // e.g. "home-assistant_turn_on"
  description: string;
  paramSummary: string[];     // e.g. ["entity_id (required)", "brightness?"]
  category: string;           // from manifest.category
  keywords: string[];         // tokenized from name + description
}

export interface ToolLookupResult {
  handler: ToolHandler;
  credentials: Record<string, string>;
  manifest: ToolManifest;
  autoAllow: boolean;
}

let registry: ToolRegistryEntry[] = [];

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
 * Called after all tools are loaded. Only indexes enabled, non-direct tools
 * that have their required credentials configured.
 */
export function rebuildRegistry(): void {
  const loadedTools = getLoadedTools();
  const entries: ToolRegistryEntry[] = [];

  for (const [toolId, loaded] of loadedTools) {
    // Skip direct tools — they're sent to the LLM directly
    if (DIRECT_TOOL_IDS.includes(toolId)) continue;

    // Check if tool is enabled
    const configRow = db
      .select()
      .from(schema.toolConfigs)
      .where(eq(schema.toolConfigs.toolId, toolId))
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
      const fullName = `${toolId}_${fnSpec.name}`;
      const keywords = [
        ...tokenize(toolId),
        ...tokenize(fnSpec.name),
        ...tokenize(fnSpec.description),
        ...tokenize(loaded.manifest.name),
        ...tokenize(category),
      ];

      entries.push({
        toolId,
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
  log.dev.debug(`Tool registry rebuilt: ${entries.length} routed functions`);
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
export function lookupFunction(fullName: string): ToolLookupResult | null {
  const entry = registry.find((e) => e.fullName === fullName);
  if (!entry) return null;

  const loadedTools = getLoadedTools();
  const loaded = loadedTools.get(entry.toolId);
  if (!loaded) return null;

  const handler = loaded.handlers[entry.functionName];
  if (!handler) return null;

  const configRow = db
    .select()
    .from(schema.toolConfigs)
    .where(eq(schema.toolConfigs.toolId, entry.toolId))
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
 * Intentionally omits function names and tool IDs to prevent models from
 * constructing direct tool calls. Only display names are shown.
 */
export function getToolCatalog(): string {
  // Collect unique tool display names per category
  const toolsByCategory = new Map<string, Set<string>>();

  for (const entry of registry) {
    if (!toolsByCategory.has(entry.category)) {
      toolsByCategory.set(entry.category, new Set());
    }
    const loaded = getLoadedTools().get(entry.toolId);
    const displayName = loaded?.manifest.name ?? entry.toolId;
    toolsByCategory.get(entry.category)!.add(displayName);
  }

  if (toolsByCategory.size === 0) return "";

  const lines = [
    "## Available Extended Tools",
    "",
    "You have access to the tools below, but they are NOT in your direct tool set.",
    "Always use `find_tools` first, then `use_tool` to execute. Never guess tool names.",
    "",
  ];

  for (const [category, names] of toolsByCategory) {
    lines.push(`- **${category}**: ${[...names].join(" · ")}`);
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
