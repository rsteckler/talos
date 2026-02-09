import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { KNOWN_MODELS } from "../providers/knownModels.js";
import type { Provider } from "@talos/shared";

const router = Router();

// --- Helpers ---

function toProviderResponse(row: typeof schema.providers.$inferSelect): Provider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.baseUrl,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

function seedModels(providerId: string, providerType: string): void {
  const knownModels = KNOWN_MODELS[providerType];
  if (!knownModels) return;

  const now = new Date().toISOString();
  for (const km of knownModels) {
    db.insert(schema.models)
      .values({
        id: crypto.randomUUID(),
        providerId,
        modelId: km.modelId,
        displayName: km.displayName,
        isDefault: false,
        createdAt: now,
      })
      .run();
  }
}

// --- Zod Schemas ---

const createProviderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

const setActiveModelSchema = z.object({
  modelId: z.string().min(1),
});

// --- Routes ---

// GET /api/providers
router.get("/providers", (_req, res) => {
  const rows = db.select().from(schema.providers).all();
  res.json({ data: rows.map(toProviderResponse) });
});

// POST /api/providers
router.post("/providers", (req, res) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const { name, type, apiKey, baseUrl } = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(schema.providers)
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

  seedModels(id, type);

  const created = db.select().from(schema.providers).where(eq(schema.providers.id, id)).get();
  if (!created) {
    res.status(500).json({ error: "Failed to create provider" });
    return;
  }

  res.status(201).json({ data: toProviderResponse(created) });
});

// DELETE /api/providers/:id
router.delete("/providers/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(schema.providers).where(eq(schema.providers.id, id!)).get();
  if (!existing) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  db.delete(schema.providers).where(eq(schema.providers.id, id!)).run();
  res.json({ data: { success: true } });
});

// GET /api/providers/:id/models
router.get("/providers/:id/models", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(schema.providers).where(eq(schema.providers.id, id!)).get();
  if (!existing) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  const rows = db
    .select()
    .from(schema.models)
    .where(eq(schema.models.providerId, id!))
    .all();

  res.json({ data: rows });
});

// POST /api/providers/:id/models/refresh
router.post("/providers/:id/models/refresh", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(schema.providers).where(eq(schema.providers.id, id!)).get();
  if (!existing) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  db.delete(schema.models).where(eq(schema.models.providerId, id!)).run();
  seedModels(id!, existing.type);

  const rows = db
    .select()
    .from(schema.models)
    .where(eq(schema.models.providerId, id!))
    .all();

  res.json({ data: rows });
});

// GET /api/models/active
router.get("/models/active", (_req, res) => {
  const activeModel = db
    .select()
    .from(schema.models)
    .where(eq(schema.models.isDefault, true))
    .get();

  if (!activeModel) {
    res.json({ data: { model: null, provider: null } });
    return;
  }

  const provider = db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, activeModel.providerId))
    .get();

  res.json({
    data: {
      model: activeModel,
      provider: provider ? toProviderResponse(provider) : null,
    },
  });
});

// PUT /api/models/active
router.put("/models/active", (req, res) => {
  const parsed = setActiveModelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const { modelId } = parsed.data;
  const model = db.select().from(schema.models).where(eq(schema.models.id, modelId)).get();
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  // Clear all defaults
  db.update(schema.models).set({ isDefault: false }).run();
  // Set the new default
  db.update(schema.models)
    .set({ isDefault: true })
    .where(eq(schema.models.id, modelId))
    .run();

  const provider = db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, model.providerId))
    .get();

  res.json({
    data: {
      model: { ...model, isDefault: true },
      provider: provider ? toProviderResponse(provider) : null,
    },
  });
});

export { router as providerRouter };
