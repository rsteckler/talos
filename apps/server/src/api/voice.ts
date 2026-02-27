import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import multer from "multer";
import { db, schema } from "../db/index.js";
import { KNOWN_VOICE_MODELS } from "../providers/knownVoiceModels.js";
import { getVoiceSettings } from "../providers/voice.js";
import { transcribeAudio, synthesizeSpeech } from "../services/voice.js";
import type { VoiceProvider } from "@talos/shared/types";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// --- Helpers ---

function toVoiceProviderResponse(row: typeof schema.voiceProviders.$inferSelect): VoiceProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.baseUrl,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

// --- Zod Schemas ---

const createVoiceProviderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["openai", "elevenlabs"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

const updateVoiceProviderSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().nullish(),
});

const assignVoiceRoleSchema = z.object({
  voiceProviderId: z.string().min(1),
  modelId: z.string().min(1),
  voice: z.string().nullish(),
});

const updateVoiceSettingsSchema = z.object({
  defaultVoice: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  outputFormat: z.string().min(1).optional(),
  speed: z.string().min(1).optional(),
  autoTtsEnabled: z.boolean().optional(),
});

const synthesizeSchema = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
});

// --- Voice Provider CRUD ---

// GET /api/voice/providers
router.get("/voice/providers", (_req, res) => {
  const rows = db.select().from(schema.voiceProviders).all();
  res.json({ data: rows.map(toVoiceProviderResponse) });
});

// POST /api/voice/providers
router.post("/voice/providers", (req, res) => {
  const parsed = createVoiceProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const { name, type, apiKey, baseUrl } = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(schema.voiceProviders)
    .values({
      id,
      name,
      type,
      apiKey,
      baseUrl: baseUrl ?? null,
      isActive: true,
      createdAt: now,
    })
    .run();

  const created = db.select().from(schema.voiceProviders).where(eq(schema.voiceProviders.id, id)).get();
  if (!created) {
    res.status(500).json({ error: "Failed to create voice provider" });
    return;
  }

  res.status(201).json({ data: toVoiceProviderResponse(created) });
});

// PUT /api/voice/providers/:id
router.put("/voice/providers/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(schema.voiceProviders).where(eq(schema.voiceProviders.id, id!)).get();
  if (!existing) {
    res.status(404).json({ error: "Voice provider not found" });
    return;
  }

  const parsed = updateVoiceProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const updates: Partial<Pick<typeof schema.voiceProviders.$inferInsert, "name" | "apiKey" | "baseUrl">> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.apiKey !== undefined) updates.apiKey = parsed.data.apiKey;
  if (parsed.data.baseUrl !== undefined) updates.baseUrl = parsed.data.baseUrl ?? null;

  if (Object.keys(updates).length > 0) {
    db.update(schema.voiceProviders)
      .set(updates)
      .where(eq(schema.voiceProviders.id, id!))
      .run();
  }

  const updated = db.select().from(schema.voiceProviders).where(eq(schema.voiceProviders.id, id!)).get();
  if (!updated) {
    res.status(500).json({ error: "Failed to update voice provider" });
    return;
  }

  res.json({ data: toVoiceProviderResponse(updated) });
});

// DELETE /api/voice/providers/:id
router.delete("/voice/providers/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(schema.voiceProviders).where(eq(schema.voiceProviders.id, id!)).get();
  if (!existing) {
    res.status(404).json({ error: "Voice provider not found" });
    return;
  }

  db.delete(schema.voiceProviders).where(eq(schema.voiceProviders.id, id!)).run();
  res.json({ data: { success: true } });
});

// --- Voice Models ---

// GET /api/voice/providers/:id/models
router.get("/voice/providers/:id/models", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(schema.voiceProviders).where(eq(schema.voiceProviders.id, id!)).get();
  if (!existing) {
    res.status(404).json({ error: "Voice provider not found" });
    return;
  }

  const catalog = KNOWN_VOICE_MODELS[existing.type];
  res.json({ data: catalog ?? { tts: [], stt: [] } });
});

// --- Voice Roles ---

const VOICE_ROLES = ["tts", "stt"] as const;

// GET /api/voice/roles
router.get("/voice/roles", (_req, res) => {
  const assignments = db
    .select({
      role: schema.voiceRoles.role,
      voiceProviderId: schema.voiceRoles.voiceProviderId,
      modelId: schema.voiceRoles.modelId,
      voice: schema.voiceRoles.voice,
      providerName: schema.voiceProviders.name,
    })
    .from(schema.voiceRoles)
    .innerJoin(schema.voiceProviders, eq(schema.voiceRoles.voiceProviderId, schema.voiceProviders.id))
    .all();

  res.json({ data: assignments });
});

// PUT /api/voice/roles/:role
router.put("/voice/roles/:role", (req, res) => {
  const { role } = req.params;
  if (!role || !VOICE_ROLES.includes(role as typeof VOICE_ROLES[number])) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VOICE_ROLES.join(", ")}` });
    return;
  }

  const parsed = assignVoiceRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const provider = db.select().from(schema.voiceProviders).where(eq(schema.voiceProviders.id, parsed.data.voiceProviderId)).get();
  if (!provider) {
    res.status(404).json({ error: "Voice provider not found" });
    return;
  }

  const now = new Date().toISOString();
  db.insert(schema.voiceRoles)
    .values({
      role,
      voiceProviderId: parsed.data.voiceProviderId,
      modelId: parsed.data.modelId,
      voice: parsed.data.voice ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.voiceRoles.role,
      set: {
        voiceProviderId: parsed.data.voiceProviderId,
        modelId: parsed.data.modelId,
        voice: parsed.data.voice ?? null,
        updatedAt: now,
      },
    })
    .run();

  res.json({
    data: {
      role,
      voiceProviderId: provider.id,
      modelId: parsed.data.modelId,
      voice: parsed.data.voice ?? null,
      providerName: provider.name,
    },
  });
});

// DELETE /api/voice/roles/:role
router.delete("/voice/roles/:role", (req, res) => {
  const { role } = req.params;
  if (!role || !VOICE_ROLES.includes(role as typeof VOICE_ROLES[number])) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VOICE_ROLES.join(", ")}` });
    return;
  }

  db.delete(schema.voiceRoles).where(eq(schema.voiceRoles.role, role)).run();
  res.json({ data: { success: true } });
});

// --- Voice Settings ---

// GET /api/voice/settings
router.get("/voice/settings", (_req, res) => {
  res.json({ data: getVoiceSettings() });
});

// PUT /api/voice/settings
router.put("/voice/settings", (req, res) => {
  const parsed = updateVoiceSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (parsed.data.defaultVoice !== undefined) updates["defaultVoice"] = parsed.data.defaultVoice;
  if (parsed.data.language !== undefined) updates["language"] = parsed.data.language;
  if (parsed.data.outputFormat !== undefined) updates["outputFormat"] = parsed.data.outputFormat;
  if (parsed.data.speed !== undefined) updates["speed"] = parsed.data.speed;
  if (parsed.data.autoTtsEnabled !== undefined) updates["autoTtsEnabled"] = parsed.data.autoTtsEnabled;

  db.update(schema.voiceSettings)
    .set(updates)
    .where(eq(schema.voiceSettings.id, 1))
    .run();

  res.json({ data: getVoiceSettings() });
});

// --- Voice Operations ---

// POST /api/voice/transcribe
router.post("/voice/transcribe", upload.single("audio"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }
    const result = await transcribeAudio(req.file.buffer, req.file.mimetype);
    res.json({ data: result });
  } catch (e) {
    next(e);
  }
});

// POST /api/voice/synthesize
router.post("/voice/synthesize", async (req, res, next) => {
  try {
    const parsed = synthesizeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const result = await synthesizeSpeech(parsed.data.text, { voice: parsed.data.voice });
    res.setHeader("Content-Type", result.mediaType);
    res.send(Buffer.from(result.audio));
  } catch (e) {
    next(e);
  }
});

// POST /api/voice/synthesize/:messageId
router.post("/voice/synthesize/:messageId", async (req, res, next) => {
  try {
    const msg = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, req.params["messageId"]!))
      .get();
    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const result = await synthesizeSpeech(msg.content);
    res.setHeader("Content-Type", result.mediaType);
    res.send(Buffer.from(result.audio));
  } catch (e) {
    next(e);
  }
});

export { router as voiceRouter };
