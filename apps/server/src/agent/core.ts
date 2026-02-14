import { streamText, stepCountIs } from "ai";
import { eq, asc, sql, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider, loadSystemPrompt } from "../providers/llm.js";
import { buildRoutedToolSet, lookupFunction } from "../tools/index.js";
import { createLogger } from "../logger/index.js";
import { generateConversationTitle } from "./titleGenerator.js";
import type { ModelMessage } from "ai";
import type { TokenUsage } from "@talos/shared/types";
import type { ApprovalGate } from "../tools/index.js";

const log = createLogger("agent");

// ---------------------------------------------------------------------------
// LLM error formatting
// ---------------------------------------------------------------------------

/**
 * Recursively dig through nested JSON (common with OpenRouter / proxy providers)
 * to find the deepest human-readable error message.
 */
function extractNestedMessage(data: unknown): string | null {
  if (!data) return null;

  if (typeof data === "string") {
    try {
      return extractNestedMessage(JSON.parse(data));
    } catch {
      return null;
    }
  }

  if (typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // Recurse into .error object first (handles nested proxy wrappers)
  if (obj["error"] && typeof obj["error"] === "object") {
    const errObj = obj["error"] as Record<string, unknown>;

    // OpenRouter nests the real error inside metadata.raw
    if (errObj["metadata"] && typeof errObj["metadata"] === "object") {
      const meta = errObj["metadata"] as Record<string, unknown>;
      if (typeof meta["raw"] === "string") {
        const deeper = extractNestedMessage(meta["raw"]);
        if (deeper) return deeper;
      }
    }

    if (typeof errObj["message"] === "string" && errObj["message"].length > 0) {
      return errObj["message"];
    }
  }

  if (typeof obj["message"] === "string" && obj["message"].length > 0) {
    return obj["message"];
  }

  return null;
}

/** Turn a raw AI SDK / provider error into a short, readable string. */
function formatStreamError(err: unknown): string {
  // Handle plain objects (stream error events may not be Error instances)
  if (err && typeof err === "object" && !(err instanceof Error)) {
    const obj = err as Record<string, unknown>;
    const statusCode = obj["statusCode"];
    const inner =
      extractNestedMessage(obj["responseBody"]) ??
      extractNestedMessage(obj["data"]) ??
      extractNestedMessage(obj);

    if (typeof statusCode === "number") {
      if (statusCode === 401) return "Authentication failed — check your API key in Settings.";
      if (statusCode === 403) return "Access denied by the provider. Check your API key permissions.";
      if (statusCode === 429) return "Rate limit exceeded — wait a moment and try again.";
      if (inner) return `Provider error (${statusCode}): ${inner}`;
      return `The provider returned an error (HTTP ${statusCode}).`;
    }

    if (inner) return inner;
    return String(err);
  }

  if (!(err instanceof Error)) return String(err);

  const errRecord = err as unknown as Record<string, unknown>;
  const statusCode = errRecord["statusCode"];
  const responseBody = errRecord["responseBody"];
  const data = errRecord["data"];

  // Try to extract the real message from nested response JSON
  const inner =
    extractNestedMessage(responseBody) ??
    extractNestedMessage(data);

  // Friendly messages for common HTTP status codes
  if (typeof statusCode === "number") {
    switch (statusCode) {
      case 401:
        return "Authentication failed — check your API key in Settings.";
      case 403:
        return "Access denied by the provider. Check your API key permissions.";
      case 429:
        return "Rate limit exceeded — wait a moment and try again.";
    }

    if (inner) return `Provider error (${statusCode}): ${inner}`;
    return `The provider returned an error (HTTP ${statusCode}).`;
  }

  // Network / connection errors
  if (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED")) {
    return "Could not connect to the provider. Check your network and provider URL.";
  }

  // If we found a cleaner inner message, prefer it over the raw SDK wrapper
  if (inner && inner !== err.message) return inner;

  return err.message;
}

/** Map tool call names (e.g. "web-search_search") to friendly descriptions */
function describeToolCall(toolName: string, args?: Record<string, unknown>): string {
  // Meta-tools (no underscore split needed)
  if (toolName === "find_tools") return args?.["query"] ? `Searching for tools: "${String(args["query"]).slice(0, 60)}"` : "Searching available tools";
  if (toolName === "use_tool") return args?.["tool_name"] ? `Using ${String(args["tool_name"])}` : "Using a tool";

  // Tool names are "{toolId}_{functionName}" — split on first underscore only
  const sepIdx = toolName.indexOf("_");
  const toolId = sepIdx >= 0 ? toolName.slice(0, sepIdx) : toolName;
  const fn = sepIdx >= 0 ? toolName.slice(sepIdx + 1) : "";

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
      return mapActions[fn] ?? "Using Google Maps";
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
      return googleActions[fn] ?? "Using Google Workspace";
    }
    case "shell":
      return args?.["command"] ? `Running command` : "Running a shell command";
    case "file-operations": {
      const fileActions: Record<string, string> = {
        read: "Reading a file",
        write: "Writing a file",
        list: "Listing files",
      };
      return fileActions[fn] ?? "Accessing files";
    }
    case "datetime":
      return "Checking the current date and time";
    case "self": {
      const doc = typeof args?.["document"] === "string" ? args["document"] : "";
      const docLabels: Record<string, string> = { soul: "personality", tools: "tool instructions", human: "user notes" };
      const label = docLabels[doc] ?? doc;
      if (fn === "read_document") return label ? `Reading ${label}` : "Reading self-knowledge";
      if (fn === "write_document") return label ? `Updating ${label}` : "Updating self-knowledge";
      return "Accessing self-knowledge";
    }
    case "chat-history": {
      const historyActions: Record<string, string> = {
        list_conversations: "Browsing conversations",
        recent_conversations: "Checking today's conversations",
        search_conversations: "Searching conversation titles",
        search_messages: args?.["query"] ? `Searching chat history for "${String(args["query"]).slice(0, 50)}"` : "Searching chat history",
        get_conversation: "Reading a past conversation",
        get_message: "Reading a past message",
      };
      return historyActions[fn] ?? "Browsing chat history";
    }
    default:
      return `Using ${toolName}`;
  }
}

// ---------------------------------------------------------------------------
// Text tool call fallback
// ---------------------------------------------------------------------------

interface TextToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

/** Try to parse a tool invocation from a JSON object. */
function parseToolCallJson(parsed: Record<string, unknown>): TextToolCall | null {
  // {"name": "use_tool", "arguments": {"tool_name": "...", "args": {...}}}
  if (parsed["name"] === "use_tool") {
    const inner = parsed["arguments"] as Record<string, unknown> | undefined;
    const toolName = inner?.["tool_name"];
    if (typeof toolName === "string") {
      return { toolName, args: (inner?.["args"] ?? {}) as Record<string, unknown> };
    }
  }

  // {"tool_name": "...", "args": {...}} — bare use_tool arguments
  if (typeof parsed["tool_name"] === "string") {
    return {
      toolName: parsed["tool_name"],
      args: (parsed["args"] ?? {}) as Record<string, unknown>,
    };
  }

  // {"name": "obsidian_search_notes", "arguments": {...}} — direct routed call
  if (typeof parsed["name"] === "string" && parsed["name"] !== "find_tools") {
    return {
      toolName: parsed["name"],
      args: (parsed["arguments"] ?? parsed["args"] ?? {}) as Record<string, unknown>,
    };
  }

  return null;
}

/**
 * Extract a tool call emitted as text instead of a proper function call.
 * Some models (especially smaller/free ones) output tool calls as
 * `<tool_call>` tags or JSON code blocks instead of using the API.
 */
function extractTextToolCall(text: string): TextToolCall | null {
  const jsonCandidates: string[] = [];

  // <tool_call>JSON</tool_call>
  const tagMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
  if (tagMatch?.[1]) jsonCandidates.push(tagMatch[1].trim());

  // ```json\nJSON\n``` containing tool-like keys
  const codeMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeMatch?.[1] && (codeMatch[1].includes('"name"') || codeMatch[1].includes('"tool_name"'))) {
    jsonCandidates.push(codeMatch[1].trim());
  }

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const result = parseToolCallJson(parsed);
      if (result) return result;
    } catch {
      continue;
    }
  }

  return null;
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

    // Build routed tool set: direct tools + find_tools/use_tool meta-tools
    const { tools, toolPrompts } = buildRoutedToolSet(approvalGate);
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
    log.dev.debug("Streaming started", { conversationId, modelId: active.modelId, providerType: active.providerType, toolCount: Object.keys(tools).length, tools: Object.keys(tools) });

    let fullContent = "";
    let stepCount = 0;
    let toolCallCount = 0;
    let lastFinishReason = "";
    let streamError: unknown = null;
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

      // Suppress Node unhandled-rejection warnings on derived promises.
      // Errors are handled via the fullStream "error" event below.
      const noop = () => {};
      Promise.resolve(streamResult.usage).catch(noop);
      Promise.resolve(streamResult.response).catch(noop);
      Promise.resolve(streamResult.text).catch(noop);

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
            streamError = part.error;
            log.error("LLM stream error", { error: formatStreamError(part.error) });
            break;
        }
      }

      // If the stream errored, skip usage/cost fetching — those promises will reject
      if (streamError) return;

      // Accumulate token usage from this stream
      try {
        const usage = await streamResult.usage;
        totalUsage.inputTokens += usage.inputTokens ?? 0;
        totalUsage.outputTokens += usage.outputTokens ?? 0;
        totalUsage.totalTokens += (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      } catch {
        // Usage unavailable when stream errored
        return;
      }

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

    // If the stream produced an API-level error, report it immediately
    // instead of retrying (the retry would likely fail the same way).
    if (streamError && fullContent.length === 0) {
      const friendly = formatStreamError(streamError);
      onError(friendly);
      return;
    }

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
      streamError = null;
      await runStream(false);
    }

    // If the retry also produced an error, report it
    if (streamError && fullContent.length === 0) {
      const friendly = formatStreamError(streamError);
      onError(friendly);
      return;
    }

    // --- Text tool call fallback ---
    // Some models emit tool calls as text (e.g. <tool_call>JSON</tool_call>)
    // instead of proper function calls. Detect this, execute the tool, and
    // re-stream so the LLM can produce a natural language response.
    const textToolCall = extractTextToolCall(fullContent);
    if (textToolCall && !streamError) {
      const syntheticId = `text-fallback-${crypto.randomUUID()}`;
      log.user.high(`Model emitted tool call as text — executing fallback for ${textToolCall.toolName}`, { tool: textToolCall.toolName, args: textToolCall.args });
      log.dev.debug("Text tool call fallback detected", { toolName: textToolCall.toolName, args: textToolCall.args });

      const lookup = lookupFunction(textToolCall.toolName);
      if (lookup) {
        let approved = true;
        onToolCall?.(syntheticId, textToolCall.toolName, textToolCall.args);

        if (!lookup.autoAllow && approvalGate) {
          approved = await approvalGate(syntheticId, textToolCall.toolName, textToolCall.args);
          if (!approved) {
            log.user.medium("Tool denied", { tool: textToolCall.toolName });
          }
        }

        if (approved) {
          try {
            const result = await lookup.handler(textToolCall.args, lookup.credentials);
            log.dev.debug("Text fallback tool executed", { toolName: textToolCall.toolName, resultPreview: JSON.stringify(result).slice(0, 100) });
            onToolResult?.(syntheticId, textToolCall.toolName, result);

            // Re-stream with tool result for a natural language response
            const resultJson = JSON.stringify(result, null, 2);
            const truncated = resultJson.length > 8000 ? resultJson.slice(0, 8000) + "\n...(truncated)" : resultJson;

            messages.push(
              { role: "assistant" as const, content: fullContent },
              { role: "user" as const, content: `[The tool "${textToolCall.toolName}" returned this result:]\n\n${truncated}\n\nRespond to the user's original request using this data. Do not include any tool call syntax in your response.` },
            );

            onChunk("\n\n");
            fullContent += "\n\n";
            toolCallCount++;
            await runStream(false);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.error("Text fallback tool execution failed", { toolName: textToolCall.toolName, error: message });
          }
        }
      } else {
        log.warn("Text fallback: tool not found in registry", { toolName: textToolCall.toolName });
      }
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
    const friendly = formatStreamError(err);
    log.error("Stream error", { error: friendly });
    onError(friendly);
  }
}
