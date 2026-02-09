import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { ClientMessage, ServerMessage } from "@talos/shared/types";
import { streamChat } from "../agent/core.js";

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("[WS] Client connected");

    const abortControllers = new Map<string, AbortController>();

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
          handleChat(ws, msg.conversationId, msg.content, abortControllers);
          break;
        case "cancel":
          handleCancel(msg.conversationId, abortControllers);
          break;
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
      for (const controller of abortControllers.values()) {
        controller.abort();
      }
      abortControllers.clear();
    });
  });

  console.log("[WS] WebSocket server attached");
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
): void {
  const controller = new AbortController();
  abortControllers.set(conversationId, controller);

  sendMessage(ws, { type: "status", status: "thinking" });

  let sentFirstChunk = false;

  streamChat(conversationId, content, {
    onChunk: (chunk) => {
      if (!sentFirstChunk) {
        sendMessage(ws, { type: "status", status: "responding" });
        sentFirstChunk = true;
      }
      sendMessage(ws, { type: "chunk", conversationId, content: chunk });
    },
    onEnd: (messageId) => {
      abortControllers.delete(conversationId);
      sendMessage(ws, { type: "end", conversationId, messageId });
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
    signal: controller.signal,
  }).catch((err: unknown) => {
    // Safety net for any unhandled rejection in streamChat
    console.error("[WS] Unhandled streamChat error:", err);
    abortControllers.delete(conversationId);
    sendMessage(ws, {
      type: "error",
      conversationId,
      error: err instanceof Error ? err.message : "Internal server error",
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
