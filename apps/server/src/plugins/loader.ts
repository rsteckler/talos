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
import {
  isDockerAvailable,
  buildSidecarImage,
  startSidecar,
  stopSidecar,
  stopAllSidecars,
} from "./sidecar.js";

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

      // Capture optional lifecycle hooks
      const startFn = typeof mod.start === "function"
        ? (mod.start as LoadedPlugin["start"])
        : undefined;
      const stopFn = typeof mod.stop === "function"
        ? (mod.stop as LoadedPlugin["stop"])
        : undefined;

      loadedPlugins.set(manifest.id, { manifest, handlers, triggers, promptMd, pluginDir, start: startFn, stop: stopFn });

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

// --- Plugin lifecycle (sidecars + start/stop hooks) ---

const activePlugins = new Set<string>();

export async function initPlugins(): Promise<void> {
  let dockerAvailable: boolean | null = null; // lazy-checked on first sidecar

  for (const [pluginId, loaded] of loadedPlugins) {
    const hasSidecar = !!loaded.manifest.sidecar;
    const hasStart = !!loaded.start;

    if (!hasSidecar && !hasStart) continue;

    // Check enabled + credentials (same pattern as channels registry)
    const configRow = db
      .select()
      .from(schema.pluginConfigs)
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .get();

    if (!configRow?.isEnabled) continue;

    const storedConfig: Record<string, string> = configRow.config
      ? (JSON.parse(configRow.config) as Record<string, string>)
      : {};

    const requiredCreds = (loaded.manifest.credentials ?? []).filter((c) => c.required);
    const hasRequired = requiredCreds.every((c) => !!storedConfig[c.name]);
    if (!hasRequired) {
      log.warn(`Plugin "${loaded.manifest.name}" enabled but missing required credentials, skipping init`);
      continue;
    }

    // Extract credentials from stored config
    const credentialNames = new Set((loaded.manifest.credentials ?? []).map((c) => c.name));
    const credentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(storedConfig)) {
      if (credentialNames.has(key)) {
        credentials[key] = value;
      }
    }

    const pluginLog = createPluginLogger(loaded.manifest);

    // Handle sidecar
    if (hasSidecar) {
      const sidecar = loaded.manifest.sidecar!;

      // Lazy Docker availability check
      if (dockerAvailable === null) {
        dockerAvailable = await isDockerAvailable();
      }

      if (!dockerAvailable) {
        log.warn(`Docker not available — skipping sidecar for plugin "${loaded.manifest.name}"`);
        continue;
      }

      try {
        await buildSidecarImage(pluginId, loaded.pluginDir, sidecar, pluginLog);
        await startSidecar(pluginId, loaded.pluginDir, sidecar, credentials, pluginLog);
      } catch (err) {
        log.error(`Failed to start sidecar for plugin "${loaded.manifest.name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    // Call plugin start() if exported
    if (hasStart) {
      try {
        await loaded.start!(credentials, pluginLog);
      } catch (err) {
        log.error(`Failed to start plugin "${loaded.manifest.name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    activePlugins.add(pluginId);
    log.info(`Plugin "${loaded.manifest.name}" initialized`);
  }
}

export async function shutdownPlugins(): Promise<void> {
  for (const pluginId of activePlugins) {
    const loaded = loadedPlugins.get(pluginId);
    if (!loaded) continue;

    if (loaded.stop) {
      try {
        await loaded.stop();
      } catch (err) {
        log.error(`Failed to stop plugin "${loaded.manifest.name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  activePlugins.clear();
  await stopAllSidecars();
}
