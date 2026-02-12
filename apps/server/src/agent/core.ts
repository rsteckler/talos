import { streamText, stepCountIs } from "ai";
import { eq, asc, sql, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider, loadSystemPrompt } from "../providers/llm.js";
import { buildToolSet } from "../tools/index.js";
import { createLogger } from "../logger/index.js";
import { generateConversationTitle } from "./titleGenerator.js";
import type { ModelMessage } from "ai";
import type { TokenUsage } from "@talos/shared/types";
import type { ApprovalGate } from "../tools/index.js";

const log = createLogger("agent");

/** Map tool call names (e.g. "web-search__search") to friendly descriptions */
function describeToolCall(toolName: string, args?: Record<string, unknown>): string {
  const [toolId, fn] = toolName.split("__");

  switch (toolId) {
    case "web-search":
      return args?.["query"] ? `Searching the web for "${String(args["query"]).slice(0, 60)}"` : "Searching the web";
    case "google-maps": {
      const mapActions: Record<string, string> = {
        places_search: "Searching for places",
        place_details: "Looking up place details",
        places_nearby: "Finding nearby places",
        directions: "Getting directions",
        distance_matrix: "Calculating distances",
        geocode: "Looking up an address",
        reverse_geocode: "Looking up a location",
        place_autocomplete: "Searching for places",
      };
      return mapActions[fn ?? ""] ?? "Using Google Maps";
    }
    case "google": {
      const googleActions: Record<string, string> = {
        gmail_search: "Searching email",
        gmail_read: "Reading an email",
        gmail_send: "Sending an email",
        gmail_reply: "Replying to an email",
        gmail_archive: "Archiving an email",
        calendar_list_events: "Checking the calendar",
        calendar_create_event: "Creating a calendar event",
        drive_list: "Browsing Google Drive",
        drive_read: "Reading a file from Drive",
        sheets_read: "Reading a spreadsheet",
        sheets_write: "Writing to a spreadsheet",
        docs_read: "Reading a document",
        slides_read: "Reading a presentation",
      };
      return googleActions[fn ?? ""] ?? "Using Google Workspace";
    }
    case "shell":
      return args?.["command"] ? `Running command` : "Running a shell command";
    case "file-operations": {
      const fileActions: Record<string, string> = {
        read: "Reading a file",
        write: "Writing a file",
        list: "Listing files",
      };
      return fileActions[fn ?? ""] ?? "Accessing files";
    }
    default:
      return `Using ${toolName}`;
  }
}

interface StreamCallbacks {
  onChunk: (content: string) => void;
  onEnd: (messageId: string, usage?: TokenUsage) => void;
  onError: (error: string) => void;
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void;
  approvalGate?: ApprovalGate;
  signal?: AbortSignal;
}

export async function streamChat(
  conversationId: string,
  userContent: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { onChunk, onEnd, onError, onToolCall, onToolResult, approvalGate, signal } = callbacks;

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
    const { tools, toolPrompts } = buildToolSet(undefined, approvalGate);
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

    log.user.high("Thinking", { query: userContent.slice(0, 100) });
    log.dev.debug("Streaming started", { conversationId, modelId: active.modelId, providerType: active.providerType, toolCount: Object.keys(tools).length });

    let fullContent = "";
    let stepCount = 0;
    let toolCallCount = 0;
    let lastFinishReason = "";
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    // Stream helper — runs the LLM, collects text, and accumulates token usage
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
            log.user.high(describeToolCall(part.toolName, part.input as Record<string, unknown>), { tool: part.toolName, args: part.input });
            log.dev.debug("Tool call args", { toolCallId: part.toolCallId, toolName: part.toolName, args: part.input });
            onToolCall?.(part.toolCallId, part.toolName, part.input as Record<string, unknown>);
            break;
          case "tool-result":
            log.user.medium("Tool finished", { tool: part.toolName, result: part.output });
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

      // Accumulate token usage from this stream
      const usage = await streamResult.usage;
      totalUsage.inputTokens += usage.inputTokens ?? 0;
      totalUsage.outputTokens += usage.outputTokens ?? 0;
      totalUsage.totalTokens += (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);

      // For OpenRouter: attempt to fetch cost from generation stats
      if (active.providerType === "openrouter") {
        try {
          const response = await streamResult.response;
          const generationId = response.headers?.["x-openrouter-generation-id"];
          if (generationId && active.apiKey) {
            const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
              headers: { Authorization: `Bearer ${active.apiKey}` },
            });
            if (genRes.ok) {
              const genData = await genRes.json() as { data?: { total_cost?: number } };
              if (genData.data?.total_cost != null) {
                totalUsage.cost = (totalUsage.cost ?? 0) + genData.data.total_cost;
              }
            }
          }
        } catch {
          // Cost fetching is best-effort — never block the response
        }
      }
    };

    // First attempt: with tools if available
    await runStream(true);

    // If the model returned nothing and tools were passed, retry without tools.
    // Some models don't support tool calling and silently return empty responses.
    if (fullContent.length === 0 && hasTools) {
      if (toolCallCount === 0) {
        log.user.high("Retrying without tools", { reason: "empty response", toolCount: Object.keys(tools).length });
      } else {
        log.user.high("Retrying without tools", { reason: "tools called but no text produced", toolCalls: toolCallCount });
      }
      stepCount = 0;
      toolCallCount = 0;
      lastFinishReason = "";
      await runStream(false);
    }

    // Post-stream summary
    if (fullContent.length > 0) {
      log.user.high("Responded", { preview: fullContent.slice(0, 100), toolCalls: toolCallCount, steps: stepCount });
      log.dev.debug("Stream complete", { length: fullContent.length, steps: stepCount, toolCalls: toolCallCount, finishReason: lastFinishReason });
    } else {
      const modelName = active.modelId.split("/").pop() ?? active.modelId;
      log.user.high("Empty response from model", { model: modelName, toolCalls: toolCallCount, toolsOffered: hasTools });
      log.dev.debug("Stream empty", { steps: stepCount, toolCalls: toolCallCount, finishReason: lastFinishReason });
      onError("The model returned an empty response. It may not support tool calling — try disabling tools or switching models.");
      return;
    }

    // Persist assistant message (with usage if available)
    const assistantMsgId = crypto.randomUUID();
    const hasUsage = totalUsage.totalTokens > 0;
    db.insert(schema.messages)
      .values({
        id: assistantMsgId,
        conversationId,
        role: "assistant",
        content: fullContent,
        usage: hasUsage ? JSON.stringify(totalUsage) : null,
        createdAt: new Date().toISOString(),
      })
      .run();

    // Update conversation updated_at again
    db.update(schema.conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(schema.conversations.id, conversationId))
      .run();

    // Generate a title after the first assistant message in a conversation
    const assistantCount = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.messages)
      .where(and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.role, "assistant"),
      ))
      .get();

    if (assistantCount?.count === 1) {
      generateConversationTitle(conversationId, userContent, fullContent).catch(() => {
        // Fire-and-forget — errors already logged inside generateConversationTitle
      });
    }

    log.dev.debug("Token usage", totalUsage);
    onEnd(assistantMsgId, hasUsage ? totalUsage : undefined);
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
