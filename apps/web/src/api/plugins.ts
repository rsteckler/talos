import { request } from "./client"
import type { PluginInfo, TriggerTypeInfo } from "@talos/shared/types"

export const pluginsApi = {
  list: () => request<PluginInfo[]>("/plugins"),

  get: (id: string) => request<PluginInfo>(`/plugins/${id}`),

  updateConfig: (id: string, config: Record<string, string>) =>
    request<PluginInfo>(`/plugins/${id}/config`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),

  enable: (id: string) =>
    request<PluginInfo>(`/plugins/${id}/enable`, { method: "POST" }),

  disable: (id: string) =>
    request<PluginInfo>(`/plugins/${id}/disable`, { method: "POST" }),

  setAllowWithoutAsking: (id: string, allow: boolean) =>
    request<PluginInfo>(`/plugins/${id}/allow-without-asking`, {
      method: "POST",
      body: JSON.stringify({ allow }),
    }),

  oauthStatus: (provider: string) =>
    request<{ connected: boolean }>(`/oauth/${provider}/status`),

  oauthDisconnect: (provider: string) =>
    request<PluginInfo>(`/oauth/${provider}/disconnect`, { method: "POST" }),

  getTriggerTypes: () =>
    request<TriggerTypeInfo[]>("/trigger-types"),

  callFunction: (pluginId: string, fn: string, args?: Record<string, unknown>) =>
    request<unknown>(`/plugins/${pluginId}/call/${fn}`, {
      method: "POST",
      body: JSON.stringify({ args: args ?? {} }),
    }),
}
