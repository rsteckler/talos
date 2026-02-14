import { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { useChatStore, useProviderStore, useConnectionStore } from "@/stores"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { InlineChatLog } from "@/components/chat/InlineChatLog"
import { InboxContextCard } from "@/components/chat/InboxContextCard"
import { ChatLogFilterDialog } from "@/components/chat/ChatLogFilterDialog"
import { useSettings } from "@/contexts/SettingsContext"
import { Send, Loader2, AlertCircle, ScrollText, Plus } from "lucide-react"
import type { FormEvent, KeyboardEvent } from "react"
import type { Message, LogEntry } from "@talos/shared/types"

type TimelineItem =
  | { kind: "message"; data: Message }
  | { kind: "log"; data: LogEntry }

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning."
  if (hour < 18) return "Good afternoon."
  return "Good evening."
}

export function ChatArea() {
  const activeModel = useProviderStore((s) => s.activeModel)
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const clearInput = useChatStore((s) => s.clearInput)
  const addMessage = useChatStore((s) => s.addMessage)
  const messages = useChatStore((s) => s.messages)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const chatLogs = useChatStore((s) => s.chatLogs)
  const clearChatLogs = useChatStore((s) => s.clearChatLogs)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const createConversation = useChatStore((s) => s.createConversation)
  const inboxContext = useChatStore((s) => s.inboxContext)
  const setInboxContext = useChatStore((s) => s.setInboxContext)
  const send = useConnectionStore((s) => s.send)
  const connectionStatus = useConnectionStore((s) => s.status)
  const agentStatus = useConnectionStore((s) => s.agentStatus)
  const latestStatusLog = useConnectionStore((s) => s.latestStatusLog)
  const { settings } = useSettings()

  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [])

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

    // Build content — prepend inbox context if present
    let content = trimmed
    if (inboxContext) {
      content = `[Context — "${inboxContext.title}"]\n${inboxContext.content}\n\nUser: ${trimmed}`
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
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    // Send via WebSocket
    send({ type: "chat", conversationId, content })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const form = e.currentTarget.form
      if (form) form.requestSubmit()
    }
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
    <div className="isolate relative flex min-h-0 flex-1 flex-col bg-background">
      {/* Header */}
      <header className="ambient-glow flex shrink-0 items-center gap-2 border-b border-border/50 bg-background px-4 py-4">
        {/* Center: Talos name + status */}
        <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center">
          <div className="flex flex-col items-center leading-none">
            <span className="text-base font-semibold text-foreground">Talos</span>
            <span className="text-[10px] font-mono text-muted-foreground/70 italic truncate max-w-[140px]">
              {agentStatus === "idle" ? "Sleeping" : latestStatusLog ?? "Thinking\u2026"}
            </span>
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end leading-none">
          <span className="text-xs text-muted-foreground">
            {activeModel.model?.displayName}
          </span>
          {sessionUsage && (
            <span className="text-[10px] text-muted-foreground/70">
              {sessionUsage.totalTokens.toLocaleString()} tokens
              {sessionUsage.cost != null && ` · $${sessionUsage.cost.toFixed(4)}`}
            </span>
          )}
        </div>
        {settings.showLogsInChat && (
          <button
            onClick={() => setFilterDialogOpen(true)}
            className={`${sessionUsage ? "" : "ml-auto "}rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground`}
            title="Chat log filters"
          >
            <ScrollText className="size-4" />
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex-1 font-chat scrollbar-thumb-only p-4 pb-20">
          {messages.length === 0 && !inboxContext ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              {!hasProvider ? (
                <>
                  <AlertCircle className="size-8 text-muted-foreground" />
                  <p className="text-sm">No model configured.</p>
                  <a
                    href="/settings"
                    className="text-sm text-primary hover:text-primary/80 underline"
                  >
                    Add a provider in Settings
                  </a>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium text-foreground">{getGreeting()}</p>
                  <p className="text-sm">How can I help you today?</p>
                </>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {inboxContext && (
                <InboxContextCard
                  item={inboxContext}
                  onDismiss={() => setInboxContext(null)}
                />
              )}
              {timeline.map((item) =>
                item.kind === "message" ? (
                  <MessageBubble key={item.data.id} message={item.data} />
                ) : (
                  <InlineChatLog key={item.data.id} entry={item.data} />
                ),
              )}
              {isStreaming && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm pl-2">
                  <Loader2 className="size-3 animate-spin" />
                  <span>Talos is thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        <div className="isolate pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-stretch px-4">
          <div className="pointer-events-auto flex items-center gap-1 px-1 pb-1">
            <button
              onClick={() => {
                setActiveConversation(null)
                clearMessages()
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="size-3" />
              New Chat
            </button>
          </div>
          <form
            onSubmit={handleSubmit}
            className="chatbox-ambient-glow pointer-events-auto flex w-full items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg"
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                resizeTextarea()
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                connectionStatus !== "connected"
                  ? "Connecting to server..."
                  : "Message Talos..."
              }
              disabled={connectionStatus !== "connected"}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              style={{ maxHeight: 200 }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isStreaming || connectionStatus !== "connected"}
              className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--orb-primary)" }}
            >
              <Send className="size-4" />
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
