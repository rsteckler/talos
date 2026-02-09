import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolManifest } from "@talos/shared/types";
import type { LoadedTool, ToolHandler } from "./types.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("tools");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, "..", "..", "..", "..", "tools");

const loadedTools = new Map<string, LoadedTool>();

export async function loadAllTools(): Promise<void> {
  loadedTools.clear();

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
      const handlers: Record<string, ToolHandler> = mod.handlers ?? {};

      // Read prompt.md if present
      const promptPath = path.join(toolDir, "prompt.md");
      const promptMd = fs.existsSync(promptPath)
        ? fs.readFileSync(promptPath, "utf-8")
        : undefined;

      loadedTools.set(manifest.id, { manifest, handlers, promptMd });
      log.dev.debug(`Loaded: ${manifest.id} (${manifest.name})`);
    } catch (err) {
      log.error(`Failed to load tool "${entry.name}"`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log.info(`${loadedTools.size} tool(s) loaded`);
}

export function getLoadedTools(): Map<string, LoadedTool> {
  return loadedTools;
}

export function getLoadedTool(id: string): LoadedTool | undefined {
  return loadedTools.get(id);
}
