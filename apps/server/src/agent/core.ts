import { streamText } from "ai";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider, loadSystemPrompt } from "../providers/llm.js";
import type { ModelMessage } from "ai";

interface StreamCallbacks {
  onChunk: (content: string) => void;
  onEnd: (messageId: string) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export async function streamChat(
  conversationId: string,
  userContent: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { onChunk, onEnd, onError, signal } = callbacks;

  const active = getActiveProvider();
  if (!active) {
    onError("No active model configured. Please add a provider and select a model in Settings.");
    return;
  }

  const systemPrompt = loadSystemPrompt();

  try {
    // Load conversation history
    const historyRows = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(asc(schema.messages.createdAt))
      .all();

    const history: ModelMessage[] = historyRows.map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));

    // Persist user message
    const userMsgId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(schema.messages)
      .values({
        id: userMsgId,
        conversationId,
        role: "user",
        content: userContent,
        createdAt: now,
      })
      .run();

    // Update conversation updated_at
    db.update(schema.conversations)
      .set({ updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))
      .run();

    // Build messages array for the LLM
    const messages: ModelMessage[] = [
      ...history,
      { role: "user", content: userContent },
    ];
    const result = streamText({
      model: active.provider(active.modelId),
      system: systemPrompt,
      messages,
      abortSignal: signal,
    });

    let fullContent = "";

    for await (const chunk of result.textStream) {
      fullContent += chunk;
      onChunk(chunk);
    }

    // Persist assistant message
    const assistantMsgId = crypto.randomUUID();
    db.insert(schema.messages)
      .values({
        id: assistantMsgId,
        conversationId,
        role: "assistant",
        content: fullContent,
        createdAt: new Date().toISOString(),
      })
      .run();

    // Update conversation updated_at again
    db.update(schema.conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(schema.conversations.id, conversationId))
      .run();

    onEnd(assistantMsgId);
  } catch (err: unknown) {
    if (signal?.aborted) {
      onError("Stream cancelled");
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error during streaming";
    console.error("[Agent] Stream error:", err);
    onError(message);
  }
}
