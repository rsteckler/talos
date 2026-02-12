import { create } from "zustand"
import type { ChannelInfo } from "@talos/shared/types"
import { channelsApi } from "@/api/channels"

interface ChannelState {
  channels: ChannelInfo[];
  loading: boolean;

  fetchChannels: () => Promise<void>;
  enableChannel: (id: string) => Promise<void>;
  disableChannel: (id: string) => Promise<void>;
  updateConfig: (id: string, config: Record<string, string>) => Promise<void>;
  setNotifications: (id: string, enabled: boolean) => Promise<void>;
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  loading: false,

  fetchChannels: async () => {
    set({ loading: true })
    try {
      const channels = await channelsApi.list()
      set({ channels })
    } catch (err) {
      console.error("[ChannelStore] Failed to fetch channels:", err)
    } finally {
      set({ loading: false })
    }
  },

  enableChannel: async (id) => {
    try {
      const updated = await channelsApi.enable(id)
      set((state) => ({
        channels: state.channels.map((c) => (c.id === id ? updated : c)),
      }))
    } catch (err) {
      console.error("[ChannelStore] Failed to enable channel:", err)
    }
  },

  disableChannel: async (id) => {
    try {
      const updated = await channelsApi.disable(id)
      set((state) => ({
        channels: state.channels.map((c) => (c.id === id ? updated : c)),
      }))
    } catch (err) {
      console.error("[ChannelStore] Failed to disable channel:", err)
    }
  },

  updateConfig: async (id, config) => {
    try {
      const updated = await channelsApi.updateConfig(id, config)
      set((state) => ({
        channels: state.channels.map((c) => (c.id === id ? updated : c)),
      }))
    } catch (err) {
      console.error("[ChannelStore] Failed to update channel config:", err)
    }
  },

  setNotifications: async (id, enabled) => {
    try {
      const updated = await channelsApi.setNotifications(id, enabled)
      set((state) => ({
        channels: state.channels.map((c) => (c.id === id ? updated : c)),
      }))
    } catch (err) {
      console.error("[ChannelStore] Failed to set notifications:", err)
    }
  },
}))
