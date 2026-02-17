import { Router } from "express";
import { eq, desc, asc, like, or, sql, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { ConversationSummary } from "@talos/shared/types";

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

// GET /api/conversations/search
router.get("/conversations/search", (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
  const offset = (page - 1) * limit;
  const search = req.query["search"] as string | undefined;

  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(schema.conversations.title, pattern),
        sql`${schema.conversations.id} IN (
          SELECT DISTINCT ${schema.messages.conversationId}
          FROM ${schema.messages}
          WHERE ${schema.messages.content} LIKE ${pattern}
        )`,
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(schema.conversations)
    .where(where)
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.conversations)
    .where(where)
    .get();

  const total = countResult?.count ?? 0;

  // Attach snippet: first ~150 chars of the most recent message
  const conversations: ConversationSummary[] = rows.map((row) => {
    const latestMsg = db
      .select({ content: schema.messages.content })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, row.id))
      .orderBy(desc(schema.messages.createdAt))
      .limit(1)
      .get();

    return {
      id: row.id,
      title: row.title,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      snippet: latestMsg ? latestMsg.content.slice(0, 150) : undefined,
    };
  });

  res.json({ data: { conversations, total, page, limit } });
});

// PATCH /api/conversations/:id
router.patch("/conversations/:id", (req, res) => {
  const { id } = req.params;
  const { title } = req.body as { title?: string };

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const existing = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id!))
    .get();

  if (!existing) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  db.update(schema.conversations)
    .set({ title: title.trim(), updatedAt: new Date().toISOString() })
    .where(eq(schema.conversations.id, id!))
    .run();

  const updated = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id!))
    .get();

  res.json({ data: updated });
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
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
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
