import { useEffect, useRef, useCallback } from "react"
import { useConnectionStore, useChatStore, useInboxStore, useLogStore } from "@/stores"
import type { ClientMessage, ServerMessage } from "@talos/shared/types"

const WS_URL = "ws://localhost:3001"
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_INTERVAL_MS = 3000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectRef = useRef<() => void>()

  const { setStatus, incrementReconnectAttempts, resetReconnectAttempts } =
    useConnectionStore.getState()

  const scheduleReconnect = useCallback(() => {
    setStatus("reconnecting")
    incrementReconnectAttempts()
    reconnectTimerRef.current = setTimeout(() => {
      connectRef.current?.()
    }, RECONNECT_INTERVAL_MS)
  }, [setStatus, incrementReconnectAttempts])

  const connect = useCallback(() => {
    const { reconnectAttempts } = useConnectionStore.getState()
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(
        `[WebSocket] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached.`
      )
      setStatus("disconnected")
      return
    }

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("[WebSocket] Connected")
        setStatus("connected")
        resetReconnectAttempts()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage
          handleMessage(message)
        } catch {
          console.warn("[WebSocket] Failed to parse message:", event.data)
        }
      }

      ws.onclose = () => {
        // Only act if this is still the active WebSocket.
        // In React StrictMode, the cleanup closes the first WS and
        // its async onclose must not clobber the replacement.
        if (wsRef.current !== ws) return
        console.log("[WebSocket] Disconnected")
        wsRef.current = null
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onclose will fire after onerror, so reconnect is handled there
        ws.close()
      }
    } catch {
      console.log("[WebSocket] Connection failed")
      scheduleReconnect()
    }
  }, [setStatus, resetReconnectAttempts, scheduleReconnect])

  connectRef.current = connect

  const send = useCallback((message: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    } else {
      console.warn("[WebSocket] Cannot send — not connected")
    }
  }, [])

  useEffect(() => {
    useConnectionStore.getState().setSendFn(send)
  }, [send])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      wsRef.current?.close()
    }
  }, [connect])

  return { send }
}

// Track the placeholder message ID for the currently streaming assistant response
let streamingPlaceholderId: string | null = null

function handleMessage(message: ServerMessage) {
  const store = useChatStore.getState()

  switch (message.type) {
    case "chunk": {
      if (!streamingPlaceholderId) {
        // Create a placeholder assistant message for streaming
        streamingPlaceholderId = `streaming-${crypto.randomUUID()}`
        store.addMessage({
          id: streamingPlaceholderId,
          conversationId: message.conversationId,
          role: "assistant",
          content: message.content,
          created_at: new Date().toISOString(),
        })
        store.setStreaming(true)
      } else {
        store.appendToLastMessage(message.content)
      }
      break
    }
    case "end":
      if (streamingPlaceholderId) {
        store.updateMessageId(streamingPlaceholderId, message.messageId)
        if (message.usage) {
          store.setMessageUsage(message.messageId, message.usage)
        }
        streamingPlaceholderId = null
      }
      store.setStreaming(false)
      break
    case "error":
      if (streamingPlaceholderId) {
        // Append the error to the streaming message
        store.appendToLastMessage(`\n\n[Error: ${message.error}]`)
        streamingPlaceholderId = null
      } else {
        // Error arrived before any chunks — show as a visible error message
        store.addMessage({
          id: `error-${crypto.randomUUID()}`,
          conversationId: message.conversationId ?? "",
          role: "assistant",
          content: `[Error: ${message.error}]`,
          created_at: new Date().toISOString(),
        })
      }
      store.setStreaming(false)
      break
    case "inbox":
      useInboxStore.getState().addItem(message.item)
      break
    case "status":
      useConnectionStore.getState().setAgentStatus(message.status)
      break
    case "tool_call":
      // Ensure there's an assistant message to attach tool calls to
      if (!streamingPlaceholderId) {
        streamingPlaceholderId = `streaming-${crypto.randomUUID()}`
        store.addMessage({
          id: streamingPlaceholderId,
          conversationId: message.conversationId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
        })
        store.setStreaming(true)
      }
      store.addToolCall({
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        args: message.args,
        status: "calling",
      })
      break
    case "tool_approval_request":
      // The tool_call event already added this entry with "calling" status.
      // Update it to "pending_approval" to show the approval prompt.
      // If no placeholder exists yet (defensive), create one and add the tool call.
      if (!streamingPlaceholderId) {
        streamingPlaceholderId = `streaming-${crypto.randomUUID()}`
        store.addMessage({
          id: streamingPlaceholderId,
          conversationId: message.conversationId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
        })
        store.setStreaming(true)
        store.addToolCall({
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          args: message.args,
          status: "pending_approval",
        })
      } else {
        store.updateToolCallStatus(message.toolCallId, "pending_approval")
      }
      break
    case "tool_result":
      store.setToolResult(message.toolCallId, message.result)
      break
    case "log":
      useLogStore.getState().addStreamedEntry(message.entry)
      useChatStore.getState().addChatLog(message.entry)
      break
  }
}
