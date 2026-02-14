import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { ClientMessage, ServerMessage, InboxItem } from "@talos/shared/types";
import { streamChat } from "../agent/core.js";
import { createLogger, addLogSubscriber, removeLogSubscriber } from "../logger/index.js";

const log = createLogger("ws");

let wssRef: WebSocketServer | null = null;

/**
 * Broadcast an inbox item to ALL connected WebSocket clients.
 * Called by the task executor when a task run completes.
 */
export function broadcastInbox(item: InboxItem): void {
  if (!wssRef) return;
  const msg = JSON.stringify({ type: "inbox", item } satisfies ServerMessage);
  for (const client of wssRef.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

/**
 * Broadcast a conversation title update to ALL connected WebSocket clients.
 * Called by the title generator after LLM generates a title.
 */
/**
 * Broadcast an agent status update to ALL connected WebSocket clients.
 * Called by the task executor so the orb reflects background activity.
 */
export function broadcastStatus(status: "idle" | "thinking" | "tool_calling" | "responding"): void {
  if (!wssRef) return;
  const msg = JSON.stringify({ type: "status", status } satisfies ServerMessage);
  for (const client of wssRef.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastConversationTitleUpdate(conversationId: string, title: string): void {
  if (!wssRef) return;
  const msg = JSON.stringify({ type: "conversation_title_update", conversationId, title } satisfies ServerMessage);
  for (const client of wssRef.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });
  wssRef = wss;

  wss.on("connection", (ws) => {
    log.dev.debug("Client connected");

    const abortControllers = new Map<string, AbortController>();
    const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendMessage(ws, { type: "error" , error: "Invalid message format" });
        return;
      }

      switch (msg.type) {
        case "chat":
          log.user.medium("Message received", { conversationId: msg.conversationId, preview: msg.content.slice(0, 100) });
          handleChat(ws, msg.conversationId, msg.content, abortControllers, pendingApprovals);
          break;
        case "cancel":
          handleCancel(msg.conversationId, abortControllers);
          break;
        case "tool_approve": {
          const pending = pendingApprovals.get(msg.toolCallId);
          if (pending) {
            pendingApprovals.delete(msg.toolCallId);
            pending.resolve(true);
          }
          break;
        }
        case "tool_deny": {
          const pending = pendingApprovals.get(msg.toolCallId);
          if (pending) {
            pendingApprovals.delete(msg.toolCallId);
            pending.resolve(false);
          }
          break;
        }
        case "subscribe_logs":
          addLogSubscriber(ws);
          log.dev.debug("Client subscribed to logs");
          break;
        case "unsubscribe_logs":
          removeLogSubscriber(ws);
          log.dev.debug("Client unsubscribed from logs");
          break;
      }
    });

    ws.on("close", () => {
      log.dev.debug("Client disconnected");
      removeLogSubscriber(ws);
      for (const controller of abortControllers.values()) {
        controller.abort();
      }
      abortControllers.clear();
      // Deny all pending approvals on disconnect
      for (const [, pending] of pendingApprovals) {
        pending.resolve(false);
      }
      pendingApprovals.clear();
    });
  });

  log.info("WebSocket server attached");
}

function sendMessage(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleChat(
  ws: WebSocket,
  conversationId: string,
  content: string,
  abortControllers: Map<string, AbortController>,
  pendingApprovals: Map<string, { resolve: (approved: boolean) => void }>,
): void {
  const controller = new AbortController();
  abortControllers.set(conversationId, controller);

  sendMessage(ws, { type: "status", status: "thinking" });

  let sentFirstChunk = false;

  const approvalGate = (toolCallId: string, toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // Send approval request to client
      sendMessage(ws, {
        type: "tool_approval_request",
        conversationId,
        toolCallId,
        toolName,
        args,
      });

      // Waits indefinitely for user response.
      // Cleaned up on disconnect (denied) or cancel (aborted).
      pendingApprovals.set(toolCallId, { resolve });
    });
  };

  streamChat(conversationId, content, {
    onChunk: (chunk) => {
      if (!sentFirstChunk) {
        sendMessage(ws, { type: "status", status: "responding" });
        sentFirstChunk = true;
      }
      sendMessage(ws, { type: "chunk", conversationId, content: chunk });
    },
    onToolCall: (toolCallId, toolName, args) => {
      sendMessage(ws, { type: "status", status: "tool_calling" });
      sendMessage(ws, {
        type: "tool_call",
        conversationId,
        toolCallId,
        toolName,
        args,
      });
      // Reset sentFirstChunk so next text after tool results gets "responding" status
      sentFirstChunk = false;
    },
    onToolResult: (toolCallId, toolName, result) => {
      sendMessage(ws, {
        type: "tool_result",
        conversationId,
        toolCallId,
        toolName,
        result,
      });
    },
    onEnd: (messageId, usage) => {
      abortControllers.delete(conversationId);
      sendMessage(ws, { type: "end", conversationId, messageId, usage });
      sendMessage(ws, { type: "status", status: "idle" });
    },
    onError: (error) => {
      abortControllers.delete(conversationId);
      sendMessage(ws, {
        type: "error" ,
        conversationId,
        error,
      });
      sendMessage(ws, { type: "status", status: "idle" });
    },
    approvalGate,
    signal: controller.signal,
  }).catch((err: unknown) => {
    // Safety net for any unhandled rejection in streamChat
    const brief = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    log.error("Unhandled streamChat error", { error: brief });
    abortControllers.delete(conversationId);
    sendMessage(ws, {
      type: "error",
      conversationId,
      error: "An unexpected error occurred. Check server logs for details.",
    });
    sendMessage(ws, { type: "status", status: "idle" });
  });
}

function handleCancel(
  conversationId: string,
  abortControllers: Map<string, AbortController>,
): void {
  const controller = abortControllers.get(conversationId);
  if (controller) {
    controller.abort();
    abortControllers.delete(conversationId);
  }
}
