import { useRef, useEffect, useMemo, useState } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useChatStore, useProviderStore, useConnectionStore } from "@/stores"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { InlineChatLog } from "@/components/chat/InlineChatLog"
import { ChatLogFilterDialog } from "@/components/chat/ChatLogFilterDialog"
import { useSettings } from "@/contexts/SettingsContext"
import { Send, Loader2, AlertCircle, ScrollText } from "lucide-react"
import type { FormEvent } from "react"
import type { Message, LogEntry } from "@talos/shared/types"

type TimelineItem =
  | { kind: "message"; data: Message }
  | { kind: "log"; data: LogEntry }

export function ChatArea() {
  const activeModel = useProviderStore((s) => s.activeModel)
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const clearInput = useChatStore((s) => s.clearInput)
  const addMessage = useChatStore((s) => s.addMessage)
  const messages = useChatStore((s) => s.messages)
  const chatLogs = useChatStore((s) => s.chatLogs)
  const clearChatLogs = useChatStore((s) => s.clearChatLogs)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const createConversation = useChatStore((s) => s.createConversation)
  const send = useConnectionStore((s) => s.send)
  const sendFn = useConnectionStore((s) => s.sendFn)
  const connectionStatus = useConnectionStore((s) => s.status)
  const { settings } = useSettings()

  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Subscribe/unsubscribe to WS log streaming when showLogsInChat is enabled
  useEffect(() => {
    if (settings.showLogsInChat && sendFn) {
      sendFn({ type: "subscribe_logs" })
      return () => {
        sendFn({ type: "unsubscribe_logs" })
      }
    }
  }, [settings.showLogsInChat, sendFn])

  // Clear chat logs when switching conversations
  useEffect(() => {
    clearChatLogs()
  }, [activeConversationId, clearChatLogs])

  // Build merged timeline of messages and logs
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!settings.showLogsInChat || chatLogs.length === 0) {
      return messages.map((data) => ({ kind: "message" as const, data }))
    }
    const items: TimelineItem[] = [
      ...messages.map((data) => ({ kind: "message" as const, data })),
      ...chatLogs.map((data) => ({ kind: "log" as const, data })),
    ]
    items.sort((a, b) => {
      const tsA = a.kind === "message" ? a.data.created_at : a.data.timestamp
      const tsB = b.kind === "message" ? b.data.created_at : b.data.timestamp
      return tsA.localeCompare(tsB)
    })
    return items
  }, [messages, chatLogs, settings.showLogsInChat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [timeline])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed || isStreaming) return

    let conversationId = activeConversationId

    // Auto-create conversation if none active
    if (!conversationId) {
      try {
        const title = trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed
        const conversation = await createConversation(title)
        conversationId = conversation.id
      } catch (err) {
        console.error("[ChatArea] Failed to create conversation:", err)
        return
      }
    }

    // Add user message to local store
    addMessage({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    })
    clearInput()

    // Send via WebSocket
    send({ type: "chat", conversationId, content: trimmed })
  }

  const hasProvider = activeModel.model !== null

  const sessionUsage = useMemo(() => {
    let inputTokens = 0
    let outputTokens = 0
    let totalTokens = 0
    let cost: number | undefined
    for (const msg of messages) {
      if (msg.usage) {
        inputTokens += msg.usage.inputTokens
        outputTokens += msg.usage.outputTokens
        totalTokens += msg.usage.totalTokens
        if (msg.usage.cost != null) {
          cost = (cost ?? 0) + msg.usage.cost
        }
      }
    }
    if (totalTokens === 0) return null
    return { inputTokens, outputTokens, totalTokens, cost }
  }, [messages])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 px-4 bg-zinc-950/50">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <span className="font-semibold text-zinc-100">Chat</span>
        {activeModel.model && (
          <span className="text-xs text-zinc-500">
            {activeModel.model.displayName}
          </span>
        )}
        {sessionUsage && (
          <span className="ml-auto text-xs text-zinc-500">
            {sessionUsage.totalTokens.toLocaleString()} tokens
            {sessionUsage.cost != null && ` · $${sessionUsage.cost.toFixed(4)}`}
          </span>
        )}
        {settings.showLogsInChat && (
          <button
            onClick={() => setFilterDialogOpen(true)}
            className={`${sessionUsage ? "" : "ml-auto "}rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300`}
            title="Chat log filters"
          >
            <ScrollText className="size-4" />
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 scrollbar-thumb-only p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
              {!hasProvider ? (
                <>
                  <AlertCircle className="size-8 text-zinc-600" />
                  <p className="text-sm">No model configured.</p>
                  <a
                    href="/settings"
                    className="text-sm text-cyan-500 hover:text-cyan-400 underline"
                  >
                    Add a provider in Settings
                  </a>
                </>
              ) : (
                <p className="text-sm">Send a message to start chatting.</p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {timeline.map((item) =>
                item.kind === "message" ? (
                  <MessageBubble key={item.data.id} message={item.data} />
                ) : (
                  <InlineChatLog key={item.data.id} entry={item.data} />
                ),
              )}
              {isStreaming && (
                <div className="flex items-center gap-2 text-zinc-500 text-sm pl-11">
                  <Loader2 className="size-3 animate-spin" />
                  <span>Talos is thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        <div className="border-t border-zinc-800 p-4 bg-zinc-950/50">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                connectionStatus !== "connected"
                  ? "Connecting to server..."
                  : "Message Talos..."
              }
              disabled={connectionStatus !== "connected"}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 ring-offset-background placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isStreaming || connectionStatus !== "connected"}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white ring-offset-background transition-colors hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="size-4" />
              Send
            </button>
          </form>
        </div>
      </div>
      <ChatLogFilterDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
      />
    </div>
  )
}
