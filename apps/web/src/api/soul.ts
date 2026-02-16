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

export const pluginsPromptApi = {
  get: () => request<SoulContent>("/agent/plugins"),

  update: (content: string) =>
    request<SoulContent>("/agent/plugins", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

export const humanPromptApi = {
  get: () => request<SoulContent>("/agent/human"),

  update: (content: string) =>
    request<SoulContent>("/agent/human", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};
