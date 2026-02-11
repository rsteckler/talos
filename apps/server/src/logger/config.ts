import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { UserLogLevel, DevLogLevel, LogConfig, LogSettings } from "@talos/shared/types";

/** Predefined logging areas */
export const PREDEFINED_AREAS = ["server", "ws", "agent", "db", "tools", "api"] as const;

const DEFAULT_USER_LEVEL: UserLogLevel = "medium";
const DEFAULT_DEV_LEVEL: DevLogLevel = "debug";

/** In-memory config cache */
const configCache = new Map<string, { userLevel: UserLogLevel; devLevel: DevLogLevel }>();

/** User-axis level ordering (higher index = more verbose config shows more) */
const USER_LEVEL_ORDER: Record<string, number> = {
  silent: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** Dev-axis level ordering */
const DEV_LEVEL_ORDER: Record<string, number> = {
  silent: 0,
  debug: 1,
  verbose: 2,
};

/**
 * Message importance → minimum config level needed to show it.
 * user.high messages show when config >= low (threshold 1)
 * user.medium messages show when config >= medium (threshold 2)
 * user.low messages show when config >= high (threshold 3)
 */
const USER_MESSAGE_THRESHOLD: Record<string, number> = {
  high: 1,    // important → shown at low+
  medium: 2,  // moderate → shown at medium+
  low: 3,     // chatty → shown at high only
};

/**
 * dev.debug messages show when config >= debug (threshold 1)
 * dev.verbose messages show when config >= verbose (threshold 2)
 */
const DEV_MESSAGE_THRESHOLD: Record<string, number> = {
  debug: 1,
  verbose: 2,
};

export function loadConfigCache(): void {
  configCache.clear();
  const rows = db.select().from(schema.logConfigs).all();
  for (const row of rows) {
    configCache.set(row.area, {
      userLevel: row.userLevel as UserLogLevel,
      devLevel: row.devLevel as DevLogLevel,
    });
  }

  // Ensure _default exists
  if (!configCache.has("_default")) {
    const now = new Date().toISOString();
    db.insert(schema.logConfigs)
      .values({ area: "_default", userLevel: DEFAULT_USER_LEVEL, devLevel: DEFAULT_DEV_LEVEL, updatedAt: now })
      .onConflictDoNothing()
      .run();
    configCache.set("_default", { userLevel: DEFAULT_USER_LEVEL, devLevel: DEFAULT_DEV_LEVEL });
  }
}

export function getEffectiveConfig(area: string): { userLevel: UserLogLevel; devLevel: DevLogLevel } {
  return configCache.get(area) ?? configCache.get("_default") ?? {
    userLevel: DEFAULT_USER_LEVEL,
    devLevel: DEFAULT_DEV_LEVEL,
  };
}

export function shouldLog(area: string, axis: "user" | "dev", messageLevel: string): boolean {
  const config = getEffectiveConfig(area);

  if (axis === "user") {
    const configValue = USER_LEVEL_ORDER[config.userLevel] ?? 0;
    const threshold = USER_MESSAGE_THRESHOLD[messageLevel] ?? 0;
    return configValue >= threshold;
  }

  const configValue = DEV_LEVEL_ORDER[config.devLevel] ?? 0;
  const threshold = DEV_MESSAGE_THRESHOLD[messageLevel] ?? 0;
  return configValue >= threshold;
}

export function getAllConfigs(): LogConfig[] {
  const rows = db.select().from(schema.logConfigs).all();
  return rows.map((r) => ({
    area: r.area,
    userLevel: r.userLevel as UserLogLevel,
    devLevel: r.devLevel as DevLogLevel,
  }));
}

export function setAreaConfig(area: string, userLevel: UserLogLevel, devLevel: DevLogLevel): void {
  const now = new Date().toISOString();
  db.insert(schema.logConfigs)
    .values({ area, userLevel, devLevel, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.logConfigs.area,
      set: { userLevel, devLevel, updatedAt: now },
    })
    .run();
  configCache.set(area, { userLevel, devLevel });
}

export function getLogSettings(): LogSettings {
  const row = db.select().from(schema.logSettings).get();
  return { pruneDays: row?.pruneDays ?? 7 };
}

export function setLogSettings(pruneDays: number): void {
  const now = new Date().toISOString();
  const existing = db.select().from(schema.logSettings).get();
  if (existing) {
    db.update(schema.logSettings)
      .set({ pruneDays, updatedAt: now })
      .where(eq(schema.logSettings.id, existing.id))
      .run();
  } else {
    db.insert(schema.logSettings)
      .values({ id: 1, pruneDays, updatedAt: now })
      .run();
  }
}

export function ensureLogArea(area: string): void {
  if (configCache.has(area)) return;
  const now = new Date().toISOString();
  db.insert(schema.logConfigs)
    .values({ area, userLevel: DEFAULT_USER_LEVEL, devLevel: DEFAULT_DEV_LEVEL, updatedAt: now })
    .onConflictDoNothing()
    .run();
  configCache.set(area, { userLevel: DEFAULT_USER_LEVEL, devLevel: DEFAULT_DEV_LEVEL });
}

export function getKnownAreas(): string[] {
  // Predefined areas + any dynamic areas from config
  const fromConfig = db.select({ area: schema.logConfigs.area }).from(schema.logConfigs).all();
  const areaSet = new Set<string>([...PREDEFINED_AREAS]);
  for (const row of fromConfig) {
    if (row.area !== "_default") {
      areaSet.add(row.area);
    }
  }
  return [...areaSet].sort();
}
