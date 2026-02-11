import { Router } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { InboxItem } from "@talos/shared/types";

const router = Router();

type InboxRow = typeof schema.inbox.$inferSelect;

function toInboxResponse(row: InboxRow): InboxItem {
  return {
    id: row.id,
    task_run_id: row.taskRunId,
    title: row.title,
    content: row.content,
    type: row.type,
    is_read: row.isRead,
    created_at: row.createdAt,
  };
}

// GET /api/inbox
router.get("/inbox", (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query["limit"]) || 20));
  const offset = Math.max(0, Number(req.query["offset"]) || 0);
  const unreadOnly = req.query["unread"] === "true";

  let query = db.select().from(schema.inbox).orderBy(desc(schema.inbox.createdAt));
  let countQuery = db.select({ value: count() }).from(schema.inbox);

  if (unreadOnly) {
    query = query.where(eq(schema.inbox.isRead, false)) as typeof query;
    countQuery = countQuery.where(eq(schema.inbox.isRead, false)) as typeof countQuery;
  }

  const rows = query.limit(limit).offset(offset).all();
  const totalRow = countQuery.get();
  const total = totalRow?.value ?? 0;

  res.json({ data: { items: rows.map(toInboxResponse), total } });
});

// PUT /api/inbox/:id/read
router.put("/inbox/:id/read", (req, res) => {
  const id = req.params["id"]!;
  const existing = db.select().from(schema.inbox).where(eq(schema.inbox.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: "Inbox item not found" });
    return;
  }

  db.update(schema.inbox)
    .set({ isRead: true })
    .where(eq(schema.inbox.id, id))
    .run();

  const updated = db.select().from(schema.inbox).where(eq(schema.inbox.id, id)).get()!;
  res.json({ data: toInboxResponse(updated) });
});

// DELETE /api/inbox/:id
router.delete("/inbox/:id", (req, res) => {
  const id = req.params["id"]!;
  const existing = db.select().from(schema.inbox).where(eq(schema.inbox.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: "Inbox item not found" });
    return;
  }

  db.delete(schema.inbox).where(eq(schema.inbox.id, id)).run();
  res.json({ data: { success: true } });
});

export const inboxRouter = router;
