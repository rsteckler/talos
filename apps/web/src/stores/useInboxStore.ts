import { create } from "zustand"
import { inboxApi } from "@/api/inbox"
import type { InboxItem } from "@talos/shared/types"

const PAGE_SIZE = 20

interface InboxState {
  items: InboxItem[]
  unreadCount: number
  total: number
  hasMore: boolean
  isLoading: boolean
  isFetchingMore: boolean
  addItem: (item: InboxItem) => void
  markAsRead: (id: string) => Promise<void>
  removeItem: (id: string) => Promise<void>
  setItems: (items: InboxItem[]) => void
  fetchInbox: () => Promise<void>
  fetchMore: () => Promise<void>
}

export const useInboxStore = create<InboxState>((set, get) => ({
  items: [],
  unreadCount: 0,
  total: 0,
  hasMore: false,
  isLoading: false,
  isFetchingMore: false,

  addItem: (item) =>
    set((state) => {
      const items = [item, ...state.items]
      const total = state.total + 1
      return { items, total, unreadCount: items.filter((i) => !i.is_read).length }
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
      const total = Math.max(0, state.total - 1)
      return { items, total, hasMore: total > items.length, unreadCount: items.filter((i) => !i.is_read).length }
    })
  },

  setItems: (items) =>
    set({ items, unreadCount: items.filter((i) => !i.is_read).length }),

  fetchInbox: async () => {
    set({ isLoading: true })
    try {
      const { items, total } = await inboxApi.list({ limit: PAGE_SIZE, offset: 0 })
      set({
        items,
        total,
        hasMore: total > items.length,
        unreadCount: items.filter((i) => !i.is_read).length,
        isLoading: false,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchMore: async () => {
    const { hasMore, isFetchingMore, items } = get()
    if (!hasMore || isFetchingMore) return

    set({ isFetchingMore: true })
    try {
      const { items: newItems, total } = await inboxApi.list({
        limit: PAGE_SIZE,
        offset: items.length,
      })
      set((state) => {
        const allItems = [...state.items, ...newItems]
        return {
          items: allItems,
          total,
          hasMore: total > allItems.length,
          isFetchingMore: false,
        }
      })
    } catch {
      set({ isFetchingMore: false })
    }
  },
}))
