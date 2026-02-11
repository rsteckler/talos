import pino from "pino";
import type { LogEntry } from "@talos/shared/types";
import { db, schema } from "../db/index.js";
import { loadConfigCache, shouldLog } from "./config.js";
import { broadcastLog } from "./broadcast.js";
import { startPruneSchedule } from "./pruner.js";

export interface AreaLogger {
  user: {
    low: (message: string, data?: unknown) => void;
    medium: (message: string, data?: unknown) => void;
    high: (message: string, data?: unknown) => void;
  };
  dev: {
    debug: (message: string, data?: unknown) => void;
    verbose: (message: string, data?: unknown) => void;
  };
  error: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
}

let initialized = false;

const pinoLogger = pino({
  level: "trace",
  transport: process.env["NODE_ENV"] !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

/** Safely serialize data for JSON — replaces non-serializable values */
function safeData(data: unknown): unknown {
  if (data === undefined || data === null) return data;
  if (data instanceof Error) {
    return { message: data.message, name: data.name, stack: data.stack };
  }
  // Test if it's serializable; if not, convert to string
  try {
    JSON.stringify(data);
    return data;
  } catch {
    return String(data);
  }
}

function writeLog(area: string, axis: "user" | "dev", level: string, message: string, data?: unknown): void {
  try {
    if (!initialized) {
      // Pre-init fallback: just write to console
      const prefix = `[${area}] ${axis}.${level}:`;
      if (data !== undefined) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
      return;
    }

    if (!shouldLog(area, axis, level)) return;

    const safePayload = data !== undefined ? safeData(data) : undefined;

    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      axis,
      level,
      area,
      message,
      data: safePayload,
    };

    // Write to pino (stdout)
    const pinoLevel = axis === "user" ? "info" : level === "verbose" ? "trace" : "debug";
    pinoLogger[pinoLevel]({ area, axis, level, data: safePayload }, message);

    // Write to SQLite
    try {
      db.insert(schema.logs)
        .values({
          id: entry.id,
          timestamp: entry.timestamp,
          axis: entry.axis,
          level: entry.level,
          area: entry.area,
          message: entry.message,
          data: safePayload !== undefined ? JSON.stringify(safePayload) : null,
          createdAt: entry.timestamp,
        })
        .run();
    } catch {
      // Don't let DB failures crash the app
    }

    // Broadcast to WS subscribers
    broadcastLog(entry);
  } catch {
    // Logging must never crash the caller
  }
}

function writeAlwaysLog(area: string, level: "error" | "warn" | "info", message: string, data?: unknown): void {
  try {
    if (!initialized) {
      const prefix = `[${area}] ${level}:`;
      if (level === "error") {
        console.error(prefix, message, ...(data !== undefined ? [data] : []));
      } else if (level === "warn") {
        console.warn(prefix, message, ...(data !== undefined ? [data] : []));
      } else {
        console.log(prefix, message, ...(data !== undefined ? [data] : []));
      }
      return;
    }

    const safePayload = data !== undefined ? safeData(data) : undefined;

    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      axis: "dev",
      level,
      area,
      message,
      data: safePayload,
    };

    // Write to pino (stdout)
    pinoLogger[level]({ area, data: safePayload }, message);

    // Write to SQLite
    try {
      db.insert(schema.logs)
        .values({
          id: entry.id,
          timestamp: entry.timestamp,
          axis: entry.axis,
          level: entry.level,
          area: entry.area,
          message: entry.message,
          data: safePayload !== undefined ? JSON.stringify(safePayload) : null,
          createdAt: entry.timestamp,
        })
        .run();
    } catch {
      // Don't let DB failures crash the app
    }

    // Broadcast to WS subscribers
    broadcastLog(entry);
  } catch {
    // Logging must never crash the caller
  }
}

export function createLogger(area: string): AreaLogger {
  return {
    user: {
      low: (message, data) => writeLog(area, "user", "low", message, data),
      medium: (message, data) => writeLog(area, "user", "medium", message, data),
      high: (message, data) => writeLog(area, "user", "high", message, data),
    },
    dev: {
      debug: (message, data) => writeLog(area, "dev", "debug", message, data),
      verbose: (message, data) => writeLog(area, "dev", "verbose", message, data),
    },
    error: (message, data) => writeAlwaysLog(area, "error", message, data),
    warn: (message, data) => writeAlwaysLog(area, "warn", message, data),
    info: (message, data) => writeAlwaysLog(area, "info", message, data),
  };
}

/** Call after DB migrations have run */
export function initLogger(): void {
  loadConfigCache();
  startPruneSchedule();
  initialized = true;
}

export { addLogSubscriber, removeLogSubscriber } from "./broadcast.js";
export {
  getAllConfigs,
  setAreaConfig,
  getLogSettings,
  setLogSettings,
  getKnownAreas,
  ensureLogArea,
} from "./config.js";
export { pruneLogs } from "./pruner.js";
