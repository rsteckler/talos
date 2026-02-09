import { create } from "zustand"
import type { InboxItem } from "@talos/shared/types"

interface InboxState {
  items: InboxItem[];
  unreadCount: number;
  addItem: (item: InboxItem) => void;
  markAsRead: (id: string) => void;
  removeItem: (id: string) => void;
  setItems: (items: InboxItem[]) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  items: [],
  unreadCount: 0,
  addItem: (item) =>
    set((state) => {
      const items = [item, ...state.items]
      return { items, unreadCount: items.filter((i) => !i.is_read).length }
    }),
  markAsRead: (id) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      )
      return { items, unreadCount: items.filter((i) => !i.is_read).length }
    }),
  removeItem: (id) =>
    set((state) => {
      const items = state.items.filter((item) => item.id !== id)
      return { items, unreadCount: items.filter((i) => !i.is_read).length }
    }),
  setItems: (items) =>
    set({ items, unreadCount: items.filter((i) => !i.is_read).length }),
}))
