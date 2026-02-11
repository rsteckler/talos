import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createTestApp } from "../test/setup.js";

// Mock the db module so the router uses our in-memory DB
const mockDb = { db: null as unknown, schema: null as unknown };
vi.mock("../db/index.js", () => mockDb);

// Import router AFTER mock is set up
const { conversationRouter } = await import("./conversations.js");

let request: ReturnType<typeof createTestApp>["request"];
let close: ReturnType<typeof createTestApp>["close"];

beforeEach(() => {
  const testDb = createTestDb();
  mockDb.db = testDb.db;
  mockDb.schema = testDb.schema;
  const testApp = createTestApp(conversationRouter);
  request = testApp.request;
  close = testApp.close;
});

afterEach(() => {
  close();
});

describe("GET /api/conversations", () => {
  it("returns empty array when no conversations exist", async () => {
    const res = await request("/api/conversations");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns conversations ordered by updated_at desc", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "First" }),
    });
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Second" }),
    });

    const res = await request("/api/conversations");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].title).toBe("Second");
    expect(body.data[1].title).toBe("First");
  });
});

describe("POST /api/conversations", () => {
  it("creates a conversation with given title", async () => {
    const res = await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Chat" }),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.title).toBe("Test Chat");
    expect(body.data.id).toBeDefined();
    // Drizzle returns camelCase (createdAt) from the raw row
    expect(body.data.createdAt).toBeDefined();
  });

  it("defaults to 'New Chat' when no title provided", async () => {
    const res = await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.title).toBe("New Chat");
  });

  it("accepts a client-provided id", async () => {
    const customId = "custom-id-123";
    const res = await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customId, title: "With ID" }),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.id).toBe(customId);
  });
});

describe("GET /api/conversations/:id", () => {
  it("returns conversation with messages", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "conv-1", title: "Chat" }),
    });

    // Insert a message directly via the test DB
    const db = mockDb.db as ReturnType<typeof createTestDb>["db"];
    const schema = mockDb.schema as ReturnType<typeof createTestDb>["schema"];
    db.insert(schema.messages)
      .values({
        id: "msg-1",
        conversationId: "conv-1",
        role: "user",
        content: "Hello",
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = await request("/api/conversations/conv-1");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe("conv-1");
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.messages[0].content).toBe("Hello");
    expect(body.data.messages[0].role).toBe("user");
  });

  it("returns 404 for non-existent conversation", async () => {
    const res = await request("/api/conversations/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Conversation not found");
  });
});

describe("DELETE /api/conversations/:id", () => {
  it("deletes an existing conversation", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "to-delete", title: "Delete me" }),
    });

    const delRes = await request("/api/conversations/to-delete", { method: "DELETE" });
    expect(delRes.status).toBe(200);
    const body = await delRes.json();
    expect(body.data.success).toBe(true);

    // Verify it's gone
    const getRes = await request("/api/conversations/to-delete");
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for non-existent conversation", async () => {
    const res = await request("/api/conversations/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/conversations/:id", () => {
  it("updates conversation title", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "patch-me", title: "Old Title" }),
    });

    const res = await request("/api/conversations/patch-me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.title).toBe("New Title");
  });

  it("returns 400 when title is missing", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "patch-bad", title: "Title" }),
    });

    const res = await request("/api/conversations/patch-bad", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent conversation", async () => {
    const res = await request("/api/conversations/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/conversations/search", () => {
  it("returns all conversations when no search term", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "s1", title: "Alpha" }),
    });
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "s2", title: "Beta" }),
    });

    const res = await request("/api/conversations/search");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.conversations).toHaveLength(2);
    expect(body.data.total).toBe(2);
  });

  it("searches by title", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "t1", title: "Shopping List" }),
    });
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "t2", title: "Weather Report" }),
    });

    const res = await request("/api/conversations/search?search=Shopping");
    const body = await res.json();
    expect(body.data.conversations).toHaveLength(1);
    expect(body.data.conversations[0].title).toBe("Shopping List");
  });

  it("searches by message content", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "mc1", title: "Generic" }),
    });
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "mc2", title: "Also Generic" }),
    });

    const db = mockDb.db as ReturnType<typeof createTestDb>["db"];
    const schema = mockDb.schema as ReturnType<typeof createTestDb>["schema"];
    db.insert(schema.messages)
      .values({
        id: "msg-search",
        conversationId: "mc1",
        role: "user",
        content: "Tell me about quantum physics",
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = await request("/api/conversations/search?search=quantum");
    const body = await res.json();
    expect(body.data.conversations).toHaveLength(1);
    expect(body.data.conversations[0].id).toBe("mc1");
  });

  it("includes snippet from most recent message", async () => {
    await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snip1", title: "Snippets" }),
    });

    const db = mockDb.db as ReturnType<typeof createTestDb>["db"];
    const schema = mockDb.schema as ReturnType<typeof createTestDb>["schema"];
    db.insert(schema.messages)
      .values({
        id: "msg-snip",
        conversationId: "snip1",
        role: "assistant",
        content: "This is a response that should appear as snippet",
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = await request("/api/conversations/search");
    const body = await res.json();
    expect(body.data.conversations[0].snippet).toContain("This is a response");
  });

  it("paginates results", async () => {
    for (let i = 0; i < 3; i++) {
      await request("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: `page-${i}`, title: `Page ${i}` }),
      });
    }

    const res = await request("/api/conversations/search?limit=2&page=1");
    const body = await res.json();
    expect(body.data.conversations).toHaveLength(2);
    expect(body.data.total).toBe(3);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(2);

    const res2 = await request("/api/conversations/search?limit=2&page=2");
    const body2 = await res2.json();
    expect(body2.data.conversations).toHaveLength(1);
  });
});
