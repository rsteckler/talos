import { request } from "./client";
import type { InboxItem } from "@talos/shared/types";

interface PaginatedInbox {
  items: InboxItem[];
  total: number;
}

export const inboxApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<PaginatedInbox>(`/inbox${query ? `?${query}` : ""}`);
  },

  markRead: (id: string) =>
    request<InboxItem>(`/inbox/${id}/read`, {
      method: "PUT",
    }),

  pin: (id: string) =>
    request<InboxItem>(`/inbox/${id}/pin`, {
      method: "PUT",
    }),

  unpin: (id: string) =>
    request<InboxItem>(`/inbox/${id}/unpin`, {
      method: "PUT",
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/inbox/${id}`, {
      method: "DELETE",
    }),
};
