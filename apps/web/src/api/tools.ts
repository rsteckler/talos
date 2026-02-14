import { request } from "./client"
import type { ToolInfo, TriggerTypeInfo } from "@talos/shared/types"

export const toolsApi = {
  list: () => request<ToolInfo[]>("/tools"),

  get: (id: string) => request<ToolInfo>(`/tools/${id}`),

  updateConfig: (id: string, config: Record<string, string>) =>
    request<ToolInfo>(`/tools/${id}/config`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),

  enable: (id: string) =>
    request<ToolInfo>(`/tools/${id}/enable`, { method: "POST" }),

  disable: (id: string) =>
    request<ToolInfo>(`/tools/${id}/disable`, { method: "POST" }),

  setAllowWithoutAsking: (id: string, allow: boolean) =>
    request<ToolInfo>(`/tools/${id}/allow-without-asking`, {
      method: "POST",
      body: JSON.stringify({ allow }),
    }),

  oauthStatus: (provider: string) =>
    request<{ connected: boolean }>(`/oauth/${provider}/status`),

  oauthDisconnect: (provider: string) =>
    request<ToolInfo>(`/oauth/${provider}/disconnect`, { method: "POST" }),

  getTriggerTypes: () =>
    request<TriggerTypeInfo[]>("/trigger-types"),

  callFunction: (toolId: string, fn: string, args?: Record<string, unknown>) =>
    request<unknown>(`/tools/${toolId}/call/${fn}`, {
      method: "POST",
      body: JSON.stringify({ args: args ?? {} }),
    }),
}
