import { useRef, useEffect } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useChatStore, useProviderStore, useConnectionStore } from "@/stores"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { Send, Loader2, AlertCircle } from "lucide-react"
import type { FormEvent } from "react"

export function ChatArea() {
  const activeModel = useProviderStore((s) => s.activeModel)
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const clearInput = useChatStore((s) => s.clearInput)
  const addMessage = useChatStore((s) => s.addMessage)
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const createConversation = useChatStore((s) => s.createConversation)
  const send = useConnectionStore((s) => s.send)
  const connectionStatus = useConnectionStore((s) => s.status)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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

  return (
    <div className="flex h-full flex-col bg-black">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 px-4 bg-zinc-950/50">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <span className="font-semibold text-zinc-100">Chat</span>
        {activeModel.model && (
          <span className="text-xs text-zinc-500">
            {activeModel.model.displayName}
          </span>
        )}
      </header>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-auto p-4">
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
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
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
    </div>
  )
}
