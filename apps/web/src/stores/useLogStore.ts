import { create } from "zustand";
import type { LogEntry, LogConfig, LogSettings, UserLogLevel, DevLogLevel } from "@talos/shared/types";
import { logsApi } from "@/api/logs";
import type { LogQueryParams } from "@/api/logs";

interface LogFilters {
  axis?: string;
  userLevel?: string;
  devLevel?: string;
  areas: string[];
  search: string;
}

interface LogState {
  entries: LogEntry[];
  total: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  filters: LogFilters;
  configs: LogConfig[];
  settings: LogSettings | null;
  areas: string[];
  streaming: boolean;
}

interface LogActions {
  fetchLogs: () => Promise<void>;
  fetchMore: () => Promise<void>;
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

// Levels ordered from most verbose to least verbose.
// Selecting a level includes it and everything above (less verbose / more severe).
const USER_LEVELS_ORDERED = ["low", "medium", "high"];
const DEV_LEVELS_ORDERED = ["verbose", "debug", "info", "warn", "error"];

/** Expand a level selection to include that level and all higher-severity levels. */
function expandLevels(selected: string, ordered: string[]): string[] {
  const idx = ordered.indexOf(selected);
  if (idx === -1) return [selected];
  return ordered.slice(idx);
}

/** Build comma-separated level string from separate user/dev level filters. */
function buildLevelParam(filters: LogFilters): string | undefined {
  const parts: string[] = [];
  if (filters.userLevel) parts.push(...expandLevels(filters.userLevel, USER_LEVELS_ORDERED));
  if (filters.devLevel) parts.push(...expandLevels(filters.devLevel, DEV_LEVELS_ORDERED));
  return parts.length > 0 ? parts.join(",") : undefined;
}

export const useLogStore = create<LogState & LogActions>((set, get) => ({
  entries: [],
  total: 0,
  page: 1,
  loading: false,
  loadingMore: false,
  hasMore: false,
  filters: { areas: [], search: "" },
  configs: [],
  settings: null,
  areas: [],
  streaming: false,

  fetchLogs: async () => {
    set({ loading: true });
    try {
      const { filters } = get();
      const params: LogQueryParams = {
        page: 1,
        limit: 50,
        axis: filters.axis,
        level: buildLevelParam(filters),
        area: filters.areas.length > 0 ? filters.areas.join(",") : undefined,
        search: filters.search || undefined,
      };
      const result = await logsApi.query(params);
      set({
        entries: result.logs,
        total: result.total,
        page: 1,
        loading: false,
        hasMore: result.logs.length < result.total,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchMore: async () => {
    const { loading, loadingMore, hasMore, page, filters } = get();
    if (loading || loadingMore || !hasMore) return;

    set({ loadingMore: true });
    try {
      const nextPage = page + 1;
      const params: LogQueryParams = {
        page: nextPage,
        limit: 50,
        axis: filters.axis,
        level: buildLevelParam(filters),
        area: filters.areas.length > 0 ? filters.areas.join(",") : undefined,
        search: filters.search || undefined,
      };
      const result = await logsApi.query(params);
      set((state) => ({
        entries: [...state.entries, ...result.logs],
        total: result.total,
        page: nextPage,
        loadingMore: false,
        hasMore: state.entries.length + result.logs.length < result.total,
      }));
    } catch {
      set({ loadingMore: false });
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
      // Apply client-side filters to streamed entries
      const { filters } = state;
      if (filters.axis && entry.axis !== filters.axis) return state;
      if (filters.areas.length > 0 && !filters.areas.includes(entry.area)) return state;
      if (filters.search && !entry.message.toLowerCase().includes(filters.search.toLowerCase())) return state;

      const allowedLevels = buildLevelParam(filters);
      if (allowedLevels && !allowedLevels.split(",").includes(entry.level)) return state;

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
