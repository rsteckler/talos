import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { PluginManifest, PluginTriggerHandler, PluginLogger } from "@talos/shared/types";
import type { LoadedPlugin, PluginHandler } from "./types.js";
import { db, schema } from "../db/index.js";
import { createLogger, ensureLogArea } from "../logger/index.js";
import { registerTrigger, clearRegistry } from "../triggers/registry.js";
import { rebuildRegistry } from "./registry.js";

const log = createLogger("plugins");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, "..", "..", "..", "..", "plugins");

const loadedPlugins = new Map<string, LoadedPlugin>();

function createPluginLogger(manifest: PluginManifest): PluginLogger {
  const area = `plugin:${manifest.logName ?? manifest.id}`;
  ensureLogArea(area);
  const inner = createLogger(area);
  return {
    info: (message: string) => inner.info(message),
    warn: (message: string) => inner.warn(message),
    error: (message: string) => inner.error(message),
    debug: (message: string) => inner.dev.debug(message),
  };
}

export async function loadAllPlugins(): Promise<void> {
  loadedPlugins.clear();
  clearRegistry();

  if (!fs.existsSync(PLUGINS_DIR)) {
    log.dev.debug("No plugins/ directory found, skipping plugin loading");
    return;
  }

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(PLUGINS_DIR, entry.name);
    const manifestPath = path.join(pluginDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestRaw) as PluginManifest;

      // Dynamic import of the plugin's index.ts/js
      const indexPath = path.join(pluginDir, "index.ts");
      const mod = await import(indexPath);

      // Inject scoped logger if the plugin exports init()
      const pluginLogger = createPluginLogger(manifest);
      if (typeof mod.init === "function") {
        mod.init(pluginLogger);
      }

      const handlers: Record<string, PluginHandler> = mod.handlers ?? {};

      // Load trigger handlers if the plugin declares triggers
      const triggers: Record<string, PluginTriggerHandler> = mod.triggers ?? {};

      // Register plugin-provided triggers
      if (manifest.triggers) {
        for (const triggerSpec of manifest.triggers) {
          const handler = triggers[triggerSpec.id];
          if (handler) {
            registerTrigger(manifest.id, triggerSpec.id, triggerSpec, handler);
            log.dev.debug(`Registered trigger: ${manifest.id}:${triggerSpec.id}`);
          } else {
            log.warn(`Trigger "${triggerSpec.id}" declared in ${manifest.id} manifest but no handler found`);
          }
        }
      }

      // Read prompt.md if present
      const promptPath = path.join(pluginDir, "prompt.md");
      const promptMd = fs.existsSync(promptPath)
        ? fs.readFileSync(promptPath, "utf-8")
        : undefined;

      loadedPlugins.set(manifest.id, { manifest, handlers, triggers, promptMd });

      // Auto-enable plugins with defaultEnabled if no config row exists yet
      if (manifest.defaultEnabled) {
        const existing = db
          .select()
          .from(schema.pluginConfigs)
          .where(eq(schema.pluginConfigs.pluginId, manifest.id))
          .get();
        if (!existing) {
          db.insert(schema.pluginConfigs)
            .values({
              pluginId: manifest.id,
              config: "{}",
              isEnabled: true,
              allowWithoutAsking: true,
              createdAt: new Date().toISOString(),
            })
            .run();
          log.dev.debug(`Auto-enabled: ${manifest.id} (defaultEnabled)`);
        }
      }

      log.dev.debug(`Loaded: ${manifest.id} (${manifest.name})`);
    } catch (err) {
      log.error(`Failed to load plugin "${entry.name}"`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log.info(`${loadedPlugins.size} plugin(s) loaded`);

  // Build the searchable registry of routed tool functions
  rebuildRegistry();
}

export function getLoadedPlugins(): Map<string, LoadedPlugin> {
  return loadedPlugins;
}

export function getLoadedPlugin(id: string): LoadedPlugin | undefined {
  return loadedPlugins.get(id);
}
