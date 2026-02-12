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

export const toolsPromptApi = {
  get: () => request<SoulContent>("/agent/tools"),

  update: (content: string) =>
    request<SoulContent>("/agent/tools", {
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
