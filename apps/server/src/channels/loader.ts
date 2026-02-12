import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChannelManifest } from "@talos/shared/types";
import type { LoadedChannel, ChannelHandler } from "./types.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("channels");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_DIR = path.join(__dirname, "..", "..", "..", "..", "channels");

const loadedChannels = new Map<string, LoadedChannel>();

export async function loadAllChannels(): Promise<void> {
  loadedChannels.clear();

  if (!fs.existsSync(CHANNELS_DIR)) {
    log.dev.debug("No channels/ directory found, skipping channel loading");
    return;
  }

  const entries = fs.readdirSync(CHANNELS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const channelDir = path.join(CHANNELS_DIR, entry.name);
    const manifestPath = path.join(channelDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestRaw) as ChannelManifest;

      const indexPath = path.join(channelDir, "index.ts");
      const mod = await import(indexPath);

      const handler: ChannelHandler = mod.handler;
      if (!handler || typeof handler.start !== "function" || typeof handler.stop !== "function") {
        log.warn(`Channel "${entry.name}" missing valid handler export`);
        continue;
      }

      loadedChannels.set(manifest.id, { manifest, handler });
      log.dev.debug(`Loaded: ${manifest.id} (${manifest.name})`);
    } catch (err) {
      log.error(`Failed to load channel "${entry.name}"`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log.info(`${loadedChannels.size} channel(s) loaded`);
}

export function getLoadedChannels(): Map<string, LoadedChannel> {
  return loadedChannels;
}

export function getLoadedChannel(id: string): LoadedChannel | undefined {
  return loadedChannels.get(id);
}
