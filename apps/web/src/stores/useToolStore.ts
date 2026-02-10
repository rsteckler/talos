import { create } from "zustand"
import type { ToolInfo } from "@talos/shared/types"
import { toolsApi } from "@/api/tools"

interface ToolState {
  tools: ToolInfo[];
  loading: boolean;

  fetchTools: () => Promise<void>;
  enableTool: (id: string) => Promise<void>;
  disableTool: (id: string) => Promise<void>;
  updateConfig: (id: string, config: Record<string, string>) => Promise<void>;
  setAllowWithoutAsking: (id: string, allow: boolean) => Promise<void>;
  connectOAuth: (toolId: string) => void;
  disconnectOAuth: (toolId: string) => Promise<void>;
}

export const useToolStore = create<ToolState>((set) => ({
  tools: [],
  loading: false,

  fetchTools: async () => {
    set({ loading: true })
    try {
      const tools = await toolsApi.list()
      set({ tools })
    } catch (err) {
      console.error("[ToolStore] Failed to fetch tools:", err)
    } finally {
      set({ loading: false })
    }
  },

  enableTool: async (id) => {
    try {
      const updated = await toolsApi.enable(id)
      set((state) => ({
        tools: state.tools.map((t) => (t.id === id ? updated : t)),
      }))
    } catch (err) {
      console.error("[ToolStore] Failed to enable tool:", err)
    }
  },

  disableTool: async (id) => {
    try {
      const updated = await toolsApi.disable(id)
      set((state) => ({
        tools: state.tools.map((t) => (t.id === id ? updated : t)),
      }))
    } catch (err) {
      console.error("[ToolStore] Failed to disable tool:", err)
    }
  },

  updateConfig: async (id, config) => {
    try {
      const updated = await toolsApi.updateConfig(id, config)
      set((state) => ({
        tools: state.tools.map((t) => (t.id === id ? updated : t)),
      }))
    } catch (err) {
      console.error("[ToolStore] Failed to update tool config:", err)
    }
  },

  setAllowWithoutAsking: async (id, allow) => {
    try {
      const updated = await toolsApi.setAllowWithoutAsking(id, allow)
      set((state) => ({
        tools: state.tools.map((t) => (t.id === id ? updated : t)),
      }))
    } catch (err) {
      console.error("[ToolStore] Failed to update allow without asking:", err)
    }
  },

  connectOAuth: (toolId) => {
    const tool = useToolStore.getState().tools.find((t) => t.id === toolId)
    if (!tool?.oauth) return

    const popup = window.open(
      tool.oauth.authorizeUrl,
      "oauth_popup",
      "width=600,height=700,popup=yes"
    )

    const handleMessage = (event: MessageEvent) => {
      if (event.data === "oauth_complete") {
        window.removeEventListener("message", handleMessage)
        popup?.close()
        useToolStore.getState().fetchTools()
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

  disconnectOAuth: async (toolId) => {
    const tool = useToolStore.getState().tools.find((t) => t.id === toolId)
    if (!tool?.oauth) return

    try {
      const updated = await toolsApi.oauthDisconnect(tool.oauth.provider)
      set((state) => ({
        tools: state.tools.map((t) => (t.id === toolId ? updated : t)),
      }))
    } catch (err) {
      console.error("[ToolStore] Failed to disconnect OAuth:", err)
    }
  },
}))
