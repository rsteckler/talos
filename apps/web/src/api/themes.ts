import { request } from "./client";
import type { ThemeMeta, ThemeFile } from "@talos/shared/types";

export const themesApi = {
  list: () => request<ThemeMeta[]>("/themes"),

  get: (id: string) => request<ThemeFile>(`/themes/${id}`),

  upload: (theme: ThemeFile) =>
    request<ThemeMeta>("/themes", {
      method: "POST",
      body: JSON.stringify(theme),
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/themes/${id}`, {
      method: "DELETE",
    }),
};
