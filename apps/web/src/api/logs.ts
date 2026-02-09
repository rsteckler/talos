import { request } from "./client";
import type { LogEntry, LogConfig, LogSettings, UserLogLevel, DevLogLevel } from "@talos/shared/types";

export interface LogQueryParams {
  page?: number;
  limit?: number;
  axis?: string;
  level?: string;
  area?: string;
  search?: string;
  since?: string;
  until?: string;
}

export interface LogQueryResult {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

export const logsApi = {
  query(params: LogQueryParams = {}): Promise<LogQueryResult> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    return request<LogQueryResult>(`/logs${qs ? `?${qs}` : ""}`);
  },

  getConfigs(): Promise<LogConfig[]> {
    return request<LogConfig[]>("/logs/configs");
  },

  updateConfig(area: string, userLevel: UserLogLevel, devLevel: DevLogLevel): Promise<void> {
    return request(`/logs/configs/${encodeURIComponent(area)}`, {
      method: "PUT",
      body: JSON.stringify({ userLevel, devLevel }),
    });
  },

  getSettings(): Promise<LogSettings> {
    return request<LogSettings>("/logs/settings");
  },

  updateSettings(pruneDays: number): Promise<void> {
    return request("/logs/settings", {
      method: "PUT",
      body: JSON.stringify({ pruneDays }),
    });
  },

  getAreas(): Promise<string[]> {
    return request<string[]>("/logs/areas");
  },

  purge(olderThanDays?: number): Promise<{ deleted: number }> {
    return request<{ deleted: number }>("/logs", {
      method: "DELETE",
      body: JSON.stringify({ olderThanDays: olderThanDays ?? 0 }),
    });
  },
};
