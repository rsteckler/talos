import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedTools, getLoadedTool } from "../tools/index.js";
import { getAllTriggerTypes } from "../triggers/index.js";
import type { ToolInfo } from "@talos/shared/types";

const router = Router();

function toToolInfo(toolId: string): ToolInfo | null {
  const loaded = getLoadedTool(toolId);
  if (!loaded) return null;

  const configRow = db
    .select()
    .from(schema.toolConfigs)
    .where(eq(schema.toolConfigs.toolId, toolId))
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
    triggers: loaded.manifest.triggers ?? [],
    functions: loaded.manifest.functions,
    hasRequiredCredentials,
  };
}

// GET /api/tools
router.get("/tools", (_req, res) => {
  const loadedTools = getLoadedTools();
  const tools: ToolInfo[] = [];

  for (const toolId of loadedTools.keys()) {
    const info = toToolInfo(toolId);
    if (info) tools.push(info);
  }

  res.json({ data: tools });
});

// GET /api/tools/:id
router.get("/tools/:id", (req, res) => {
  const info = toToolInfo(req.params["id"]!);
  if (!info) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  res.json({ data: info });
});

// PUT /api/tools/:id/config — Update credentials
const updateConfigSchema = z.object({
  config: z.record(z.string()),
});

router.put("/tools/:id/config", (req, res) => {
  const toolId = req.params["id"]!;
  const loaded = getLoadedTool(toolId);
  if (!loaded) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  const parsed = updateConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const existing = db
    .select()
    .from(schema.toolConfigs)
    .where(eq(schema.toolConfigs.toolId, toolId))
    .get();

  const configJson = JSON.stringify(parsed.data.config);

  if (existing) {
    db.update(schema.toolConfigs)
      .set({ config: configJson })
      .where(eq(schema.toolConfigs.toolId, toolId))
      .run();
  } else {
    db.insert(schema.toolConfigs)
      .values({
        toolId,
        config: configJson,
        isEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toToolInfo(toolId);
  res.json({ data: info });
});

// POST /api/tools/:id/enable
router.post("/tools/:id/enable", (req, res) => {
  const toolId = req.params["id"]!;
  const loaded = getLoadedTool(toolId);
  if (!loaded) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  const existing = db
    .select()
    .from(schema.toolConfigs)
    .where(eq(schema.toolConfigs.toolId, toolId))
    .get();

  if (existing) {
    db.update(schema.toolConfigs)
      .set({ isEnabled: true })
      .where(eq(schema.toolConfigs.toolId, toolId))
      .run();
  } else {
    db.insert(schema.toolConfigs)
      .values({
        toolId,
        config: "{}",
        isEnabled: true,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toToolInfo(toolId);
  res.json({ data: info });
});

// POST /api/tools/:id/disable
router.post("/tools/:id/disable", (req, res) => {
  const toolId = req.params["id"]!;
  const loaded = getLoadedTool(toolId);
  if (!loaded) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  const existing = db
    .select()
    .from(schema.toolConfigs)
    .where(eq(schema.toolConfigs.toolId, toolId))
    .get();

  if (existing) {
    db.update(schema.toolConfigs)
      .set({ isEnabled: false })
      .where(eq(schema.toolConfigs.toolId, toolId))
      .run();
  } else {
    db.insert(schema.toolConfigs)
      .values({
        toolId,
        config: "{}",
        isEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toToolInfo(toolId);
  res.json({ data: info });
});

// POST /api/tools/:id/allow-without-asking
const allowWithoutAskingSchema = z.object({
  allow: z.boolean(),
});

router.post("/tools/:id/allow-without-asking", (req, res) => {
  const toolId = req.params["id"]!;
  const loaded = getLoadedTool(toolId);
  if (!loaded) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  const parsed = allowWithoutAskingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const existing = db
    .select()
    .from(schema.toolConfigs)
    .where(eq(schema.toolConfigs.toolId, toolId))
    .get();

  if (existing) {
    db.update(schema.toolConfigs)
      .set({ allowWithoutAsking: parsed.data.allow })
      .where(eq(schema.toolConfigs.toolId, toolId))
      .run();
  } else {
    db.insert(schema.toolConfigs)
      .values({
        toolId,
        config: "{}",
        isEnabled: false,
        allowWithoutAsking: parsed.data.allow,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const info = toToolInfo(toolId);
  res.json({ data: info });
});

// GET /api/trigger-types
router.get("/trigger-types", (_req, res) => {
  res.json({ data: getAllTriggerTypes() });
});

export { router as toolRouter };
