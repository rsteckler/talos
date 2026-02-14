import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { ToolManifest, ToolTriggerHandler, ToolLogger } from "@talos/shared/types";
import type { LoadedTool, ToolHandler } from "./types.js";
import { db, schema } from "../db/index.js";
import { createLogger, ensureLogArea } from "../logger/index.js";
import { registerTrigger, clearRegistry } from "../triggers/registry.js";
import { rebuildRegistry } from "./registry.js";

const log = createLogger("tools");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, "..", "..", "..", "..", "tools");

const loadedTools = new Map<string, LoadedTool>();

function createToolLogger(manifest: ToolManifest): ToolLogger {
  const area = `tool:${manifest.logName ?? manifest.id}`;
  ensureLogArea(area);
  const inner = createLogger(area);
  return {
    info: (message: string) => inner.info(message),
    warn: (message: string) => inner.warn(message),
    error: (message: string) => inner.error(message),
    debug: (message: string) => inner.dev.debug(message),
  };
}

export async function loadAllTools(): Promise<void> {
  loadedTools.clear();
  clearRegistry();

  if (!fs.existsSync(TOOLS_DIR)) {
    log.dev.debug("No tools/ directory found, skipping tool loading");
    return;
  }

  const entries = fs.readdirSync(TOOLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const toolDir = path.join(TOOLS_DIR, entry.name);
    const manifestPath = path.join(toolDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestRaw) as ToolManifest;

      // Dynamic import of the tool's index.ts/js
      const indexPath = path.join(toolDir, "index.ts");
      const mod = await import(indexPath);

      // Inject scoped logger if the tool exports init()
      const toolLogger = createToolLogger(manifest);
      if (typeof mod.init === "function") {
        mod.init(toolLogger);
      }

      const handlers: Record<string, ToolHandler> = mod.handlers ?? {};

      // Load trigger handlers if the tool declares triggers
      const triggers: Record<string, ToolTriggerHandler> = mod.triggers ?? {};

      // Register tool-provided triggers
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
      const promptPath = path.join(toolDir, "prompt.md");
      const promptMd = fs.existsSync(promptPath)
        ? fs.readFileSync(promptPath, "utf-8")
        : undefined;

      loadedTools.set(manifest.id, { manifest, handlers, triggers, promptMd });

      // Auto-enable tools with defaultEnabled if no config row exists yet
      if (manifest.defaultEnabled) {
        const existing = db
          .select()
          .from(schema.toolConfigs)
          .where(eq(schema.toolConfigs.toolId, manifest.id))
          .get();
        if (!existing) {
          db.insert(schema.toolConfigs)
            .values({
              toolId: manifest.id,
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
      log.error(`Failed to load tool "${entry.name}"`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log.info(`${loadedTools.size} tool(s) loaded`);

  // Build the searchable registry of routed tool functions
  rebuildRegistry();
}

export function getLoadedTools(): Map<string, LoadedTool> {
  return loadedTools;
}

export function getLoadedTool(id: string): LoadedTool | undefined {
  return loadedTools.get(id);
}
