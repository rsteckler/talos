import { request } from "./client";
import type { Conversation, Message } from "@talos/shared/types";

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
};
