import { WebSocket } from "ws";
import type { LogEntry } from "@talos/shared/types";

const subscribers = new Set<WebSocket>();

export function addLogSubscriber(ws: WebSocket): void {
  subscribers.add(ws);
}

export function removeLogSubscriber(ws: WebSocket): void {
  subscribers.delete(ws);
}

export function broadcastLog(entry: LogEntry): void {
  if (subscribers.size === 0) return;

  let payload: string;
  try {
    payload = JSON.stringify({ type: "log", entry });
  } catch {
    // Non-serializable entry data — skip broadcast
    return;
  }

  for (const ws of subscribers) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        subscribers.delete(ws);
      }
    } catch {
      subscribers.delete(ws);
    }
  }
}
