import { request } from "./client"
import type { ToolInfo } from "@talos/shared/types"

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
}
