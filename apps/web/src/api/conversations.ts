import { request } from "./client";
import type { Conversation, ConversationSummary, Message } from "@talos/shared/types";

interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export const conversationsApi = {
  list: () => request<Conversation[]>("/conversations"),

  create: (data?: { id?: string; title?: string }) =>
    request<Conversation>("/conversations", {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    }),

  get: (id: string) =>
    request<ConversationWithMessages>(`/conversations/${id}`),

  remove: (id: string) =>
    request<{ success: boolean }>(`/conversations/${id}`, {
      method: "DELETE",
    }),

  search: (params: { search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    return request<{ conversations: ConversationSummary[]; total: number; page: number; limit: number }>(
      `/conversations/search?${qs.toString()}`,
    );
  },
};
