import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedChannels, getLoadedChannel, startChannel, stopChannel } from "../channels/index.js";
import type { ChannelInfo } from "@talos/shared/types";

const router = Router();

function toChannelInfo(channelId: string): ChannelInfo | null {
  const loaded = getLoadedChannel(channelId);
  if (!loaded) return null;

  const configRow = db
    .select()
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.channelId, channelId))
    .get();

  const storedConfig: Record<string, string> = configRow?.config
    ? (JSON.parse(configRow.config) as Record<string, string>)
    : {};

  const credentials = loaded.manifest.credentials;
  const requiredCreds = credentials.filter((c) => c.required);
  const hasRequiredCredentials = requiredCreds.every((c) => !!storedConfig[c.name]);

  // Build credential values: all channel credentials are secret, use "__SET__" sentinel
  const credentialValues: Record<string, string> = {};
  for (const cred of credentials) {
    if (storedConfig[cred.name]) {
      credentialValues[cred.name] = "__SET__";
    }
  }

  return {
    id: loaded.manifest.id,
    name: loaded.manifest.name,
    description: loaded.manifest.description,
    version: loaded.manifest.version,
    isEnabled: configRow?.isEnabled ?? false,
    notificationsEnabled: configRow?.notificationsEnabled ?? false,
    credentials,
    settings: loaded.manifest.settings ?? [],
    credentialValues: Object.keys(credentialValues).length > 0 ? credentialValues : undefined,
    hasRequiredCredentials,
  };
}

// GET /api/channels
router.get("/channels", (_req, res) => {
  const loadedChannels = getLoadedChannels();
  const channels: ChannelInfo[] = [];

  for (const channelId of loadedChannels.keys()) {
    const info = toChannelInfo(channelId);
    if (info) channels.push(info);
  }

  res.json({ data: channels });
});

// GET /api/channels/:id
router.get("/channels/:id", (req, res) => {
  const info = toChannelInfo(req.params["id"]!);
  if (!info) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.json({ data: info });
});

// PUT /api/channels/:id/config
const updateConfigSchema = z.object({
  config: z.record(z.string()),
});

router.put("/channels/:id/config", (req, res) => {
  const channelId = req.params["id"]!;
  const loaded = getLoadedChannel(channelId);
  if (!loaded) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const parsed = updateConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const existing = db
    .select()
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.channelId, channelId))
    .get();

  const configJson = JSON.stringify(parsed.data.config);

  if (existing) {
    db.update(schema.channelConfigs)
      .set({ config: configJson })
      .where(eq(schema.channelConfigs.channelId, channelId))
      .run();
  } else {
    db.insert(schema.channelConfigs)
      .values({
        channelId,
        config: configJson,
        isEnabled: false,
        notificationsEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toChannelInfo(channelId);
  res.json({ data: info });
});

// POST /api/channels/:id/enable
router.post("/channels/:id/enable", async (req, res) => {
  const channelId = req.params["id"]!;
  const loaded = getLoadedChannel(channelId);
  if (!loaded) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const existing = db
    .select()
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.channelId, channelId))
    .get();

  if (existing) {
    db.update(schema.channelConfigs)
      .set({ isEnabled: true })
      .where(eq(schema.channelConfigs.channelId, channelId))
      .run();
  } else {
    db.insert(schema.channelConfigs)
      .values({
        channelId,
        config: "{}",
        isEnabled: true,
        notificationsEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  try {
    await startChannel(channelId);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to start channel" });
    return;
  }

  const info = toChannelInfo(channelId);
  res.json({ data: info });
});

// POST /api/channels/:id/disable
router.post("/channels/:id/disable", async (req, res) => {
  const channelId = req.params["id"]!;
  const loaded = getLoadedChannel(channelId);
  if (!loaded) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const existing = db
    .select()
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.channelId, channelId))
    .get();

  if (existing) {
    db.update(schema.channelConfigs)
      .set({ isEnabled: false })
      .where(eq(schema.channelConfigs.channelId, channelId))
      .run();
  } else {
    db.insert(schema.channelConfigs)
      .values({
        channelId,
        config: "{}",
        isEnabled: false,
        notificationsEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  try {
    await stopChannel(channelId);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to stop channel" });
    return;
  }

  const info = toChannelInfo(channelId);
  res.json({ data: info });
});

// POST /api/channels/:id/notifications
const notificationsSchema = z.object({
  enabled: z.boolean(),
});

router.post("/channels/:id/notifications", (req, res) => {
  const channelId = req.params["id"]!;
  const loaded = getLoadedChannel(channelId);
  if (!loaded) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const parsed = notificationsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const existing = db
    .select()
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.channelId, channelId))
    .get();

  if (existing) {
    db.update(schema.channelConfigs)
      .set({ notificationsEnabled: parsed.data.enabled })
      .where(eq(schema.channelConfigs.channelId, channelId))
      .run();
  } else {
    db.insert(schema.channelConfigs)
      .values({
        channelId,
        config: "{}",
        isEnabled: false,
        notificationsEnabled: parsed.data.enabled,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toChannelInfo(channelId);
  res.json({ data: info });
});

export { router as channelRouter };
