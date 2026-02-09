import { Router } from "express";
import { eq, desc } from "drizzle-orm";
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
  const rows = req.query["unread"] === "true"
    ? db.select().from(schema.inbox).where(eq(schema.inbox.isRead, false)).orderBy(desc(schema.inbox.createdAt)).all()
    : db.select().from(schema.inbox).orderBy(desc(schema.inbox.createdAt)).all();

  res.json({ data: rows.map(toInboxResponse) });
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
