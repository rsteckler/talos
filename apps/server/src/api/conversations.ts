import { Router } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const router = Router();

// GET /api/conversations
router.get("/conversations", (_req, res) => {
  const rows = db
    .select()
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.updatedAt))
    .all();

  res.json({ data: rows });
});

// POST /api/conversations
router.post("/conversations", (req, res) => {
  const title = typeof req.body.title === "string" && req.body.title.trim()
    ? req.body.title.trim()
    : "New Chat";

  const id = req.body.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(schema.conversations)
    .values({ id, title, createdAt: now, updatedAt: now })
    .run();

  const created = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();

  if (!created) {
    res.status(500).json({ error: "Failed to create conversation" });
    return;
  }

  res.status(201).json({ data: created });
});

// GET /api/conversations/:id
router.get("/conversations/:id", (req, res) => {
  const { id } = req.params;
  const conversation = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id!))
    .get();

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id!))
    .orderBy(asc(schema.messages.createdAt))
    .all();

  res.json({
    data: {
      ...conversation,
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
        usage: m.usage ? JSON.parse(m.usage) : undefined,
      })),
    },
  });
});

// DELETE /api/conversations/:id
router.delete("/conversations/:id", (req, res) => {
  const { id } = req.params;
  const existing = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id!))
    .get();

  if (!existing) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  db.delete(schema.conversations)
    .where(eq(schema.conversations.id, id!))
    .run();

  res.json({ data: { success: true } });
});

export { router as conversationRouter };
