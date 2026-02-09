import { sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLogSettings } from "./config.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let pruneInterval: ReturnType<typeof setInterval> | null = null;

export function pruneLogs(): number {
  const { pruneDays } = getLogSettings();
  const cutoff = new Date(Date.now() - pruneDays * 24 * 60 * 60 * 1000).toISOString();

  const result = db
    .delete(schema.logs)
    .where(sql`${schema.logs.timestamp} < ${cutoff}`)
    .run();

  return result.changes;
}

export function startPruneSchedule(): void {
  if (pruneInterval) return;
  // Run once on startup
  pruneLogs();
  // Then every 6 hours
  pruneInterval = setInterval(pruneLogs, SIX_HOURS_MS);
}

export function stopPruneSchedule(): void {
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
}
