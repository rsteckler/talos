import { create } from "zustand"
import type { PluginInfo } from "@talos/shared/types"
import { pluginsApi } from "@/api/plugins"

interface PluginState {
  plugins: PluginInfo[];
  loading: boolean;

  fetchPlugins: () => Promise<void>;
  enablePlugin: (id: string) => Promise<void>;
  disablePlugin: (id: string) => Promise<void>;
  updateConfig: (id: string, config: Record<string, string>) => Promise<void>;
  setAllowWithoutAsking: (id: string, allow: boolean) => Promise<void>;
  connectOAuth: (pluginId: string) => void;
  disconnectOAuth: (pluginId: string) => Promise<void>;
}

export const usePluginStore = create<PluginState>((set) => ({
  plugins: [],
  loading: false,

  fetchPlugins: async () => {
    set({ loading: true })
    try {
      const plugins = await pluginsApi.list()
      set({ plugins })
    } catch (err) {
      console.error("[PluginStore] Failed to fetch plugins:", err)
    } finally {
      set({ loading: false })
    }
  },

  enablePlugin: async (id) => {
    try {
      const updated = await pluginsApi.enable(id)
      set((state) => ({
        plugins: state.plugins.map((p) => (p.id === id ? updated : p)),
      }))
    } catch (err) {
      console.error("[PluginStore] Failed to enable plugin:", err)
    }
  },

  disablePlugin: async (id) => {
    try {
      const updated = await pluginsApi.disable(id)
      set((state) => ({
        plugins: state.plugins.map((p) => (p.id === id ? updated : p)),
      }))
    } catch (err) {
      console.error("[PluginStore] Failed to disable plugin:", err)
    }
  },

  updateConfig: async (id, config) => {
    try {
      const updated = await pluginsApi.updateConfig(id, config)
      set((state) => ({
        plugins: state.plugins.map((p) => (p.id === id ? updated : p)),
      }))
    } catch (err) {
      console.error("[PluginStore] Failed to update plugin config:", err)
    }
  },

  setAllowWithoutAsking: async (id, allow) => {
    try {
      const updated = await pluginsApi.setAllowWithoutAsking(id, allow)
      set((state) => ({
        plugins: state.plugins.map((p) => (p.id === id ? updated : p)),
      }))
    } catch (err) {
      console.error("[PluginStore] Failed to update allow without asking:", err)
    }
  },

  connectOAuth: (pluginId) => {
    const plugin = usePluginStore.getState().plugins.find((p) => p.id === pluginId)
    if (!plugin?.oauth) return

    const popup = window.open(
      plugin.oauth.authorizeUrl,
      "oauth_popup",
      "width=600,height=700,popup=yes"
    )

    const handleMessage = (event: MessageEvent) => {
      if (event.data === "oauth_complete") {
        window.removeEventListener("message", handleMessage)
        popup?.close()
        usePluginStore.getState().fetchPlugins()
      }
    }
    window.addEventListener("message", handleMessage)

    // Clean up listener if popup closes without completing
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener("message", handleMessage)
      }
    }, 1000)
  },

  disconnectOAuth: async (pluginId) => {
    const plugin = usePluginStore.getState().plugins.find((p) => p.id === pluginId)
    if (!plugin?.oauth) return

    try {
      const updated = await pluginsApi.oauthDisconnect(plugin.oauth.provider)
      set((state) => ({
        plugins: state.plugins.map((p) => (p.id === pluginId ? updated : p)),
      }))
    } catch (err) {
      console.error("[PluginStore] Failed to disconnect OAuth:", err)
    }
  },
}))
