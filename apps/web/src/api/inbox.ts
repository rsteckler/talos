import { request } from "./client";
import type { InboxItem } from "@talos/shared/types";

export const inboxApi = {
  list: () => request<InboxItem[]>("/inbox"),

  markRead: (id: string) =>
    request<InboxItem>(`/inbox/${id}/read`, {
      method: "PUT",
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/inbox/${id}`, {
      method: "DELETE",
    }),
};
