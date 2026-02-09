import { create } from "zustand"
import type { Message, Conversation } from "@talos/shared/types"

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  inputValue: string;
  isStreaming: boolean;
  setInputValue: (value: string) => void;
  setActiveConversation: (id: string) => void;
  addMessage: (message: Message) => void;
  appendToLastMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearInput: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  inputValue: "",
  isStreaming: false,
  setInputValue: (value) => set({ inputValue: value }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
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
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearInput: () => set({ inputValue: "" }),
}))
