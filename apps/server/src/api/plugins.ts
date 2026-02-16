import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedPlugins, getLoadedPlugin } from "../plugins/index.js";
import { getAllTriggerTypes } from "../triggers/index.js";
import type { PluginInfo } from "@talos/shared/types";

const router = Router();

function toPluginInfo(pluginId: string): PluginInfo | null {
  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) return null;

  const configRow = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  const storedConfig: Record<string, string> = configRow?.config
    ? (JSON.parse(configRow.config) as Record<string, string>)
    : {};

  const credentials = loaded.manifest.credentials ?? [];
  const requiredCreds = credentials.filter((c) => c.required);
  const hasRequiredCredentials = requiredCreds.every((c) => !!storedConfig[c.name]);

  const oauthConnected = loaded.manifest.oauth
    ? !!storedConfig["refresh_token"]
    : undefined;

  // Extract saved setting values (not credentials) from stored config
  const settingSpecs = loaded.manifest.settings ?? [];
  const settingNames = new Set(settingSpecs.map((s) => s.name));
  const settingValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(storedConfig)) {
    if (settingNames.has(key)) {
      settingValues[key] = value;
    }
  }

  return {
    id: loaded.manifest.id,
    name: loaded.manifest.name,
    description: loaded.manifest.description,
    version: loaded.manifest.version,
    isEnabled: configRow?.isEnabled ?? false,
    allowWithoutAsking: configRow?.allowWithoutAsking ?? false,
    credentials,
    oauth: loaded.manifest.oauth,
    oauthConnected,
    settings: loaded.manifest.settings ?? [],
    settingValues: Object.keys(settingValues).length > 0 ? settingValues : undefined,
    triggers: loaded.manifest.triggers ?? [],
    functions: loaded.manifest.functions,
    hasRequiredCredentials,
  };
}

// GET /api/plugins
router.get("/plugins", (_req, res) => {
  const loadedPlugins = getLoadedPlugins();
  const plugins: PluginInfo[] = [];

  for (const pluginId of loadedPlugins.keys()) {
    const info = toPluginInfo(pluginId);
    if (info) plugins.push(info);
  }

  res.json({ data: plugins });
});

// GET /api/plugins/:id
router.get("/plugins/:id", (req, res) => {
  const info = toPluginInfo(req.params["id"]!);
  if (!info) {
    res.status(404).json({ error: "Plugin not found" });
    return;
  }

  res.json({ data: info });
});

// PUT /api/plugins/:id/config — Update credentials
const updateConfigSchema = z.object({
  config: z.record(z.string()),
});

router.put("/plugins/:id/config", (req, res) => {
  const pluginId = req.params["id"]!;
  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) {
    res.status(404).json({ error: "Plugin not found" });
    return;
  }

  const parsed = updateConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const existing = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  const configJson = JSON.stringify(parsed.data.config);

  if (existing) {
    db.update(schema.pluginConfigs)
      .set({ config: configJson })
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .run();
  } else {
    db.insert(schema.pluginConfigs)
      .values({
        pluginId,
        config: configJson,
        isEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toPluginInfo(pluginId);
  res.json({ data: info });
});

// POST /api/plugins/:id/enable
router.post("/plugins/:id/enable", (req, res) => {
  const pluginId = req.params["id"]!;
  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) {
    res.status(404).json({ error: "Plugin not found" });
    return;
  }

  const existing = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  if (existing) {
    db.update(schema.pluginConfigs)
      .set({ isEnabled: true })
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .run();
  } else {
    db.insert(schema.pluginConfigs)
      .values({
        pluginId,
        config: "{}",
        isEnabled: true,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toPluginInfo(pluginId);
  res.json({ data: info });
});

// POST /api/plugins/:id/disable
router.post("/plugins/:id/disable", (req, res) => {
  const pluginId = req.params["id"]!;
  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) {
    res.status(404).json({ error: "Plugin not found" });
    return;
  }

  const existing = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  if (existing) {
    db.update(schema.pluginConfigs)
      .set({ isEnabled: false })
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .run();
  } else {
    db.insert(schema.pluginConfigs)
      .values({
        pluginId,
        config: "{}",
        isEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toPluginInfo(pluginId);
  res.json({ data: info });
});

// POST /api/plugins/:id/allow-without-asking
const allowWithoutAskingSchema = z.object({
  allow: z.boolean(),
});

router.post("/plugins/:id/allow-without-asking", (req, res) => {
  const pluginId = req.params["id"]!;
  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) {
    res.status(404).json({ error: "Plugin not found" });
    return;
  }

  const parsed = allowWithoutAskingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const existing = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  if (existing) {
    db.update(schema.pluginConfigs)
      .set({ allowWithoutAsking: parsed.data.allow })
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .run();
  } else {
    db.insert(schema.pluginConfigs)
      .values({
        pluginId,
        config: "{}",
        isEnabled: false,
        allowWithoutAsking: parsed.data.allow,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toPluginInfo(pluginId);
  res.json({ data: info });
});

// POST /api/plugins/:id/call/:functionName — Call a plugin function directly
router.post("/plugins/:id/call/:functionName", async (req, res) => {
  const pluginId = req.params["id"]!;
  const functionName = req.params["functionName"]!;

  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) {
    res.status(404).json({ error: "Plugin not found" });
    return;
  }

  const handler = loaded.handlers[functionName];
  if (!handler) {
    res.status(404).json({ error: `Function '${functionName}' not found on plugin '${pluginId}'` });
    return;
  }

  // Get stored credentials
  const configRow = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  const storedConfig: Record<string, string> = configRow?.config
    ? (JSON.parse(configRow.config) as Record<string, string>)
    : {};

  const args = (req.body as { args?: Record<string, unknown> })?.args ?? {};

  try {
    const result = await handler(args, storedConfig);
    res.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Function call failed";
    res.status(500).json({ error: message });
  }
});

// GET /api/trigger-types
router.get("/trigger-types", (_req, res) => {
  res.json({ data: getAllTriggerTypes() });
});

export { router as pluginRouter };
