import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../test/setup.js";

const mockDb = { db: null as unknown, schema: null as unknown };
vi.mock("../db/index.js", () => mockDb);

// Mock the LLM provider
const mockGetActiveProvider = vi.fn();
vi.mock("../providers/llm.js", () => ({
  getActiveProvider: () => mockGetActiveProvider(),
}));

// Mock the WS broadcast
const mockBroadcast = vi.fn();
vi.mock("../ws/index.js", () => ({
  broadcastConversationTitleUpdate: (...args: unknown[]) => mockBroadcast(...args),
}));

// Mock generateText from the AI SDK
const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

// Mock the logger
vi.mock("../logger/index.js", () => ({
  createLogger: () => ({
    dev: { debug: vi.fn() },
    error: vi.fn(),
  }),
}));

const { generateConversationTitle } = await import("./titleGenerator.js");

function getDb() {
  return {
    db: mockDb.db as ReturnType<typeof createTestDb>["db"],
    schema: mockDb.schema as ReturnType<typeof createTestDb>["schema"],
  };
}

beforeEach(() => {
  const testDb = createTestDb();
  mockDb.db = testDb.db;
  mockDb.schema = testDb.schema;
  vi.clearAllMocks();
});

describe("generateConversationTitle", () => {
  it("generates a title and updates DB + broadcasts", async () => {
    const { db, schema } = getDb();
    const convId = "conv-title-1";
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "New Chat", createdAt: now, updatedAt: now })
      .run();

    mockGetActiveProvider.mockReturnValue({ model: "test-model" });
    mockGenerateText.mockResolvedValue({ text: "Discussion about quantum physics" });

    await generateConversationTitle(convId, "What is quantum physics?", "Quantum physics is...");

    // Check DB was updated
    const conv = db.select().from(schema.conversations).all()[0];
    expect(conv?.title).toBe("Discussion about quantum physics");

    // Check broadcast was called
    expect(mockBroadcast).toHaveBeenCalledWith(convId, "Discussion about quantum physics");
  });

  it("strips surrounding quotes from generated title", async () => {
    const { db, schema } = getDb();
    const convId = "conv-title-2";
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "New Chat", createdAt: now, updatedAt: now })
      .run();

    mockGetActiveProvider.mockReturnValue({ model: "test-model" });
    mockGenerateText.mockResolvedValue({ text: '"A title with quotes"' });

    await generateConversationTitle(convId, "Hello", "Hi there");

    const conv = db.select().from(schema.conversations).all()[0];
    expect(conv?.title).toBe("A title with quotes");
  });

  it("does nothing when no active provider", async () => {
    mockGetActiveProvider.mockReturnValue(null);

    await generateConversationTitle("any-id", "msg", "reply");

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("does nothing when generated text is empty", async () => {
    const { db, schema } = getDb();
    const convId = "conv-title-3";
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "New Chat", createdAt: now, updatedAt: now })
      .run();

    mockGetActiveProvider.mockReturnValue({ model: "test-model" });
    mockGenerateText.mockResolvedValue({ text: "   " });

    await generateConversationTitle(convId, "msg", "reply");

    // Title should remain unchanged
    const conv = db.select().from(schema.conversations).all()[0];
    expect(conv?.title).toBe("New Chat");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("swallows errors without throwing", async () => {
    mockGetActiveProvider.mockReturnValue({ model: "test-model" });
    mockGenerateText.mockRejectedValue(new Error("API error"));

    // Should not throw
    await expect(
      generateConversationTitle("any-id", "msg", "reply")
    ).resolves.toBeUndefined();
  });

  it("truncates assistant message to 500 chars", async () => {
    const { db, schema } = getDb();
    const convId = "conv-title-4";
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "New Chat", createdAt: now, updatedAt: now })
      .run();

    mockGetActiveProvider.mockReturnValue({ model: "test-model" });
    mockGenerateText.mockResolvedValue({ text: "Short title" });

    const longMessage = "x".repeat(1000);
    await generateConversationTitle(convId, "msg", longMessage);

    // Verify the assistant message was truncated in the API call
    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { messages: { content: string }[] } | undefined;
    const assistantContent = callArgs?.messages?.[1]?.content;
    expect(assistantContent).toHaveLength(500);
  });
});
