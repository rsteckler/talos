import { create } from "zustand"
import { inboxApi } from "@/api/inbox"
import type { InboxItem } from "@talos/shared/types"

interface InboxState {
  items: InboxItem[]
  unreadCount: number
  isLoading: boolean
  addItem: (item: InboxItem) => void
  markAsRead: (id: string) => Promise<void>
  removeItem: (id: string) => Promise<void>
  setItems: (items: InboxItem[]) => void
  fetchInbox: () => Promise<void>
}

export const useInboxStore = create<InboxState>((set) => ({
  items: [],
  unreadCount: 0,
  isLoading: false,

  addItem: (item) =>
    set((state) => {
      const items = [item, ...state.items]
      return { items, unreadCount: items.filter((i) => !i.is_read).length }
    }),

  markAsRead: async (id) => {
    try {
      await inboxApi.markRead(id)
    } catch {
      // Proceed with optimistic update even if API fails
    }
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      )
      return { items, unreadCount: items.filter((i) => !i.is_read).length }
    })
  },

  removeItem: async (id) => {
    try {
      await inboxApi.remove(id)
    } catch {
      // Proceed with optimistic update even if API fails
    }
    set((state) => {
      const items = state.items.filter((item) => item.id !== id)
      return { items, unreadCount: items.filter((i) => !i.is_read).length }
    })
  },

  setItems: (items) =>
    set({ items, unreadCount: items.filter((i) => !i.is_read).length }),

  fetchInbox: async () => {
    set({ isLoading: true })
    try {
      const items = await inboxApi.list()
      set({ items, unreadCount: items.filter((i) => !i.is_read).length, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },
}))
