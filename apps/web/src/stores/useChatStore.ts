import { create } from "zustand"
import type { Message, Conversation } from "@talos/shared/types"
import { conversationsApi } from "@/api/conversations"

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  inputValue: string;
  isStreaming: boolean;

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
  inputValue: "",
  isStreaming: false,

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
  setActiveConversation: (id) => set({ activeConversationId: id }),

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
