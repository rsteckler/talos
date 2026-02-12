import { request } from "./client"
import type { ChannelInfo } from "@talos/shared/types"

export const channelsApi = {
  list: () => request<ChannelInfo[]>("/channels"),

  get: (id: string) => request<ChannelInfo>(`/channels/${id}`),

  updateConfig: (id: string, config: Record<string, string>) =>
    request<ChannelInfo>(`/channels/${id}/config`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),

  enable: (id: string) =>
    request<ChannelInfo>(`/channels/${id}/enable`, { method: "POST" }),

  disable: (id: string) =>
    request<ChannelInfo>(`/channels/${id}/disable`, { method: "POST" }),

  setNotifications: (id: string, enabled: boolean) =>
    request<ChannelInfo>(`/channels/${id}/notifications`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
}
