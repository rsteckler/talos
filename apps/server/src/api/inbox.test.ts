import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createTestApp } from "../test/setup.js";

const mockDb = { db: null as unknown, schema: null as unknown };
vi.mock("../db/index.js", () => mockDb);

const { inboxRouter } = await import("./inbox.js");

let request: ReturnType<typeof createTestApp>["request"];
let close: ReturnType<typeof createTestApp>["close"];

function getDb() {
  return {
    db: mockDb.db as ReturnType<typeof createTestDb>["db"],
    schema: mockDb.schema as ReturnType<typeof createTestDb>["schema"],
  };
}

function insertInboxItem(overrides?: Partial<{ id: string; title: string; content: string; type: string; isRead: boolean }>) {
  const { db, schema } = getDb();
  const id = overrides?.id ?? crypto.randomUUID();
  db.insert(schema.inbox)
    .values({
      id,
      title: overrides?.title ?? "Test Item",
      content: overrides?.content ?? "Test content",
      type: (overrides?.type as "notification") ?? "notification",
      isRead: overrides?.isRead ?? false,
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}

beforeEach(() => {
  const testDb = createTestDb();
  mockDb.db = testDb.db;
  mockDb.schema = testDb.schema;
  const testApp = createTestApp(inboxRouter);
  request = testApp.request;
  close = testApp.close;
});

afterEach(() => {
  close();
});

describe("GET /api/inbox", () => {
  it("returns empty array when no items exist", async () => {
    const res = await request("/api/inbox");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns all inbox items", async () => {
    insertInboxItem({ title: "Item 1" });
    insertInboxItem({ title: "Item 2" });

    const res = await request("/api/inbox");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it("filters unread items with ?unread=true", async () => {
    insertInboxItem({ title: "Read", isRead: true });
    insertInboxItem({ title: "Unread", isRead: false });

    const res = await request("/api/inbox?unread=true");
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("Unread");
  });
});

describe("PUT /api/inbox/:id/read", () => {
  it("marks an item as read", async () => {
    const id = insertInboxItem({ isRead: false });

    const res = await request(`/api/inbox/${id}/read`, { method: "PUT" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.is_read).toBe(true);
  });

  it("returns 404 for non-existent item", async () => {
    const res = await request("/api/inbox/nonexistent/read", { method: "PUT" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/inbox/:id", () => {
  it("deletes an inbox item", async () => {
    const id = insertInboxItem();

    const res = await request(`/api/inbox/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);

    // Verify it's gone
    const listRes = await request("/api/inbox");
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(0);
  });

  it("returns 404 for non-existent item", async () => {
    const res = await request("/api/inbox/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
