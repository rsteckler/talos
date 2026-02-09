import { request } from "./client";

interface SoulContent {
  content: string;
}

export const soulApi = {
  get: () => request<SoulContent>("/agent/soul"),

  update: (content: string) =>
    request<SoulContent>("/agent/soul", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};
