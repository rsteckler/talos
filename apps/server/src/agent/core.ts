import { streamText, stepCountIs } from "ai";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider, loadSystemPrompt } from "../providers/llm.js";
import { buildToolSet } from "../tools/index.js";
import { createLogger } from "../logger/index.js";
import type { ModelMessage } from "ai";

const log = createLogger("agent");

interface StreamCallbacks {
  onChunk: (content: string) => void;
  onEnd: (messageId: string) => void;
  onError: (error: string) => void;
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void;
  signal?: AbortSignal;
}

export async function streamChat(
  conversationId: string,
  userContent: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { onChunk, onEnd, onError, onToolCall, onToolResult, signal } = callbacks;

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

    // Build tool set from enabled tools
    const { tools, toolPrompts } = buildToolSet();
    const hasTools = Object.keys(tools).length > 0;

    // Append tool prompts to system prompt
    const fullSystemPrompt = toolPrompts.length > 0
      ? `${systemPrompt}\n\n${toolPrompts.join("\n\n")}`
      : systemPrompt;

    // Build messages array for the LLM
    const messages: ModelMessage[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    log.user.high(`Thinking: "${userContent.slice(0, 50)}"`);
    log.dev.debug("Streaming started", { conversationId, modelId: active.modelId, providerType: active.providerType, toolCount: Object.keys(tools).length });

    let fullContent = "";
    let stepCount = 0;
    let toolCallCount = 0;
    let lastFinishReason = "";

    // Stream helper — runs the LLM and collects text
    const runStream = async (useTools: boolean) => {
      const streamResult = streamText({
        model: active.model,
        system: useTools ? fullSystemPrompt : systemPrompt,
        messages,
        ...(useTools && hasTools ? { tools, stopWhen: stepCountIs(10) } : {}),
        abortSignal: signal,
      });

      for await (const part of streamResult.fullStream) {
        switch (part.type) {
          case "text-delta":
            fullContent += part.text;
            onChunk(part.text);
            break;
          case "tool-call":
            toolCallCount++;
            log.user.high(`Using tool: ${part.toolName}`);
            log.dev.debug("Tool call args", { toolCallId: part.toolCallId, toolName: part.toolName, args: part.input });
            onToolCall?.(part.toolCallId, part.toolName, part.input as Record<string, unknown>);
            break;
          case "tool-result":
            log.user.medium(`Tool result: "${String(part.output).slice(0, 50)}"`);
            log.dev.debug("Tool result detail", { toolCallId: part.toolCallId, toolName: part.toolName });
            onToolResult?.(part.toolCallId, part.toolName, part.output);
            break;
          case "finish":
            stepCount++;
            lastFinishReason = part.finishReason;
            log.dev.debug("Step finished", { step: stepCount, finishReason: part.finishReason, hasContent: fullContent.length > 0, toolCalls: toolCallCount });
            break;
          case "error":
            log.error("LLM stream error", { error: part.error });
            break;
        }
      }
    };

    // First attempt: with tools if available
    await runStream(true);

    // If the model returned nothing and tools were passed, retry without tools.
    // Some models don't support tool calling and silently return empty responses.
    if (fullContent.length === 0 && hasTools) {
      if (toolCallCount === 0) {
        log.user.high(`Model returned empty response with ${Object.keys(tools).length} tool(s) offered — model may not support tool calling, retrying without tools`);
      } else {
        log.user.high("Model called tools but produced no text response — retrying without tools");
      }
      stepCount = 0;
      toolCallCount = 0;
      lastFinishReason = "";
      await runStream(false);
    }

    // Post-stream summary
    if (fullContent.length > 0) {
      if (toolCallCount > 0) {
        log.user.high(`Done (${toolCallCount} tool call(s), ${stepCount} step(s)): "${fullContent.slice(0, 50)}"`);
      } else if (hasTools) {
        log.user.medium(`Responded without using tools: "${fullContent.slice(0, 50)}"`);
      } else {
        log.user.high(`Response: "${fullContent.slice(0, 50)}"`);
      }
      log.dev.debug("Stream complete", { length: fullContent.length, steps: stepCount, toolCalls: toolCallCount, finishReason: lastFinishReason });
    } else {
      const modelName = active.modelId.split("/").pop() ?? active.modelId;
      if (hasTools && toolCallCount === 0) {
        log.user.high(`Model "${modelName}" returned nothing — it likely does not support tool calling`);
      } else {
        log.user.high(`Model "${modelName}" returned an empty response`);
      }
      log.dev.debug("Stream empty", { steps: stepCount, toolCalls: toolCallCount, finishReason: lastFinishReason });
      onError("The model returned an empty response. It may not support tool calling — try disabling tools or switching models.");
      return;
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
    log.error("Stream error", { error: message });
    onError(message);
  }
}
