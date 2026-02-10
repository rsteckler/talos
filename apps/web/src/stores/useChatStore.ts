import { create } from "zustand"
import type { Message, Conversation, ToolCallInfo, TokenUsage, LogEntry, InboxItem } from "@talos/shared/types"
import { conversationsApi } from "@/api/conversations"

const MAX_CHAT_LOGS = 500

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  chatLogs: LogEntry[];
  inputValue: string;
  isStreaming: boolean;
  inboxContext: InboxItem | null;

  // Inbox context
  setInboxContext: (item: InboxItem | null) => void;

  // Input
  setInputValue: (value: string) => void;
  clearInput: () => void;

  // Streaming
  setStreaming: (streaming: boolean) => void;

  // Messages
  addMessage: (message: Message) => void;
  appendToLastMessage: (content: string) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  updateMessageId: (oldId: string, newId: string) => void;

  // Token usage
  setMessageUsage: (messageId: string, usage: TokenUsage) => void;

  // Tool calls
  addToolCall: (toolCall: ToolCallInfo) => void;
  setToolResult: (toolCallId: string, result: unknown) => void;
  updateToolCallStatus: (toolCallId: string, status: ToolCallInfo["status"]) => void;

  // Chat logs
  addChatLog: (entry: LogEntry) => void;
  clearChatLogs: () => void;

  // Conversations
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;

  // Async actions
  fetchConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  loadConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  chatLogs: [],
  inputValue: "",
  isStreaming: false,
  inboxContext: null,

  // Inbox context
  setInboxContext: (item) => set({ inboxContext: item }),

  // Input
  setInputValue: (value) => set({ inputValue: value }),
  clearInput: () => set({ inputValue: "" }),

  // Streaming
  setStreaming: (streaming) => set({ isStreaming: streaming }),

  // Messages
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToLastMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last) {
        msgs[msgs.length - 1] = { ...last, content: last.content + content }
      }
      return { messages: msgs }
    }),
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),
  updateMessageId: (oldId, newId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === oldId ? { ...m, id: newId } : m,
      ),
    })),

  // Token usage
  setMessageUsage: (messageId, usage) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, usage } : m,
      ),
    })),

  // Tool calls — attach to the last assistant message
  addToolCall: (toolCall) =>
    set((state) => {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === "assistant") {
        const existing = last.toolCalls ?? []
        // Skip if this toolCallId already exists (tool_call and tool_approval_request can race)
        if (existing.some((tc) => tc.toolCallId === toolCall.toolCallId)) {
          return { messages: msgs }
        }
        msgs[msgs.length - 1] = {
          ...last,
          toolCalls: [...existing, toolCall],
        }
      }
      return { messages: msgs }
    }),
  setToolResult: (toolCallId, result) =>
    set((state) => {
      const msgs = state.messages.map((m) => {
        if (m.role !== "assistant" || !m.toolCalls) return m
        const hasCall = m.toolCalls.some((tc) => tc.toolCallId === toolCallId)
        if (!hasCall) return m
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.toolCallId === toolCallId
              ? { ...tc, result, status: "complete" as const }
              : tc,
          ),
        }
      })
      return { messages: msgs }
    }),
  updateToolCallStatus: (toolCallId, status) =>
    set((state) => {
      const msgs = state.messages.map((m) => {
        if (m.role !== "assistant" || !m.toolCalls) return m
        const hasCall = m.toolCalls.some((tc) => tc.toolCallId === toolCallId)
        if (!hasCall) return m
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.toolCallId === toolCallId
              ? { ...tc, status }
              : tc,
          ),
        }
      })
      return { messages: msgs }
    }),

  // Chat logs
  addChatLog: (entry) =>
    set((state) => {
      const next = [...state.chatLogs, entry]
      if (next.length > MAX_CHAT_LOGS) {
        next.splice(0, next.length - MAX_CHAT_LOGS)
      }
      return { chatLogs: next }
    }),
  clearChatLogs: () => set({ chatLogs: [] }),

  // Conversations
  setConversations: (conversations) => set({ conversations }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),
  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    })),
  setActiveConversation: (id) => set({ activeConversationId: id, inboxContext: null }),

  // Async actions
  fetchConversations: async () => {
    try {
      const conversations = await conversationsApi.list()
      set({ conversations })
    } catch (err) {
      console.error("[ChatStore] Failed to fetch conversations:", err)
    }
  },

  createConversation: async (title?: string) => {
    const id = crypto.randomUUID()
    const conversation = await conversationsApi.create({
      id,
      title: title ?? "New Chat",
    })
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
      messages: [],
    }))
    return conversation
  },

  loadConversation: async (id: string) => {
    const { activeConversationId } = get()
    if (activeConversationId === id) return

    try {
      const data = await conversationsApi.get(id)
      set({
        activeConversationId: id,
        messages: data.messages,
        inboxContext: null,
      })
    } catch (err) {
      console.error("[ChatStore] Failed to load conversation:", err)
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await conversationsApi.remove(id)
      const { activeConversationId } = get()
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        ...(activeConversationId === id
          ? { activeConversationId: null, messages: [] }
          : {}),
      }))
    } catch (err) {
      console.error("[ChatStore] Failed to delete conversation:", err)
    }
  },
}))
