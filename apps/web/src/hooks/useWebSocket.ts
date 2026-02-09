import { useEffect, useRef, useCallback } from "react"
import { useConnectionStore, useChatStore, useInboxStore } from "@/stores"
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
        streamingPlaceholderId = null
      }
      store.setStreaming(false)
      break
    case "error":
      if (streamingPlaceholderId) {
        // Append the error to the streaming message
        store.appendToLastMessage(`\n\n[Error: ${message.error}]`)
        streamingPlaceholderId = null
      }
      store.setStreaming(false)
      break
    case "inbox":
      useInboxStore.getState().addItem(message.item)
      break
    case "status":
      // Could dispatch to an agent status store in the future
      break
    case "tool_call":
    case "tool_result":
      // Will be handled when tool UI is built
      break
  }
}
