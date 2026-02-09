import { create } from "zustand";
import type { LogEntry, LogConfig, LogSettings, UserLogLevel, DevLogLevel } from "@talos/shared/types";
import { logsApi } from "@/api/logs";
import type { LogQueryParams } from "@/api/logs";

interface LogFilters {
  axis?: string;
  level?: string;
  areas: string[];
  search: string;
}

interface LogState {
  entries: LogEntry[];
  total: number;
  page: number;
  loading: boolean;
  filters: LogFilters;
  configs: LogConfig[];
  settings: LogSettings | null;
  areas: string[];
  streaming: boolean;
}

interface LogActions {
  fetchLogs: (page?: number) => Promise<void>;
  fetchConfigs: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  fetchAreas: () => Promise<void>;
  setFilter: (filter: Partial<LogFilters>) => void;
  addStreamedEntry: (entry: LogEntry) => void;
  setStreaming: (streaming: boolean) => void;
  updateConfig: (area: string, userLevel: UserLogLevel, devLevel: DevLogLevel) => Promise<void>;
  updateSettings: (pruneDays: number) => Promise<void>;
  purge: (olderThanDays?: number) => Promise<number>;
}

const MAX_STREAMED_ENTRIES = 500;

export const useLogStore = create<LogState & LogActions>((set, get) => ({
  entries: [],
  total: 0,
  page: 1,
  loading: false,
  filters: { areas: [], search: "" },
  configs: [],
  settings: null,
  areas: [],
  streaming: false,

  fetchLogs: async (page = 1) => {
    set({ loading: true });
    try {
      const { filters } = get();
      const params: LogQueryParams = {
        page,
        limit: 50,
        axis: filters.axis,
        level: filters.level,
        area: filters.areas.length > 0 ? filters.areas.join(",") : undefined,
        search: filters.search || undefined,
      };
      const result = await logsApi.query(params);
      set({ entries: result.logs, total: result.total, page: result.page, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchConfigs: async () => {
    try {
      const configs = await logsApi.getConfigs();
      set({ configs });
    } catch {
      // ignore
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await logsApi.getSettings();
      set({ settings });
    } catch {
      // ignore
    }
  },

  fetchAreas: async () => {
    try {
      const areas = await logsApi.getAreas();
      set({ areas });
    } catch {
      // ignore
    }
  },

  setFilter: (filter) => {
    set((state) => ({
      filters: { ...state.filters, ...filter },
    }));
  },

  addStreamedEntry: (entry) => {
    set((state) => {
      const next = [entry, ...state.entries];
      if (next.length > MAX_STREAMED_ENTRIES) {
        next.length = MAX_STREAMED_ENTRIES;
      }
      return { entries: next, total: state.total + 1 };
    });
  },

  setStreaming: (streaming) => set({ streaming }),

  updateConfig: async (area, userLevel, devLevel) => {
    await logsApi.updateConfig(area, userLevel, devLevel);
    // Refresh configs
    const configs = await logsApi.getConfigs();
    set({ configs });
  },

  updateSettings: async (pruneDays) => {
    await logsApi.updateSettings(pruneDays);
    set({ settings: { pruneDays } });
  },

  purge: async (olderThanDays) => {
    const result = await logsApi.purge(olderThanDays);
    // Refresh log list
    await get().fetchLogs();
    return result.deleted;
  },
}));
