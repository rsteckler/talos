import { Router } from "express";
import { z } from "zod";
import { sql, and, eq, like, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  getAllConfigs,
  setAreaConfig,
  getLogSettings,
  setLogSettings,
  getKnownAreas,
  pruneLogs,
} from "../logger/index.js";
import type { LogEntry } from "@talos/shared/types";

const router = Router();

// --- GET /logs --- Query logs with pagination and filters
router.get("/logs", (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query["limit"]) || 50));
  const offset = (page - 1) * limit;

  const axis = req.query["axis"] as string | undefined;
  const level = req.query["level"] as string | undefined;
  const area = req.query["area"] as string | undefined;
  const search = req.query["search"] as string | undefined;
  const since = req.query["since"] as string | undefined;
  const until = req.query["until"] as string | undefined;

  const conditions = [];

  if (axis === "user" || axis === "dev") {
    conditions.push(eq(schema.logs.axis, axis));
  }
  if (level) {
    conditions.push(eq(schema.logs.level, level));
  }
  if (area) {
    // Support comma-separated areas
    const areas = area.split(",").map((a) => a.trim()).filter(Boolean);
    if (areas.length === 1) {
      conditions.push(eq(schema.logs.area, areas[0]!));
    } else if (areas.length > 1) {
      conditions.push(sql`${schema.logs.area} IN (${sql.join(areas.map((a) => sql`${a}`), sql`, `)})`);
    }
  }
  if (search) {
    conditions.push(like(schema.logs.message, `%${search}%`));
  }
  if (since) {
    conditions.push(sql`${schema.logs.timestamp} >= ${since}`);
  }
  if (until) {
    conditions.push(sql`${schema.logs.timestamp} <= ${until}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = db
    .select()
    .from(schema.logs)
    .where(where)
    .orderBy(desc(schema.logs.timestamp))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.logs)
    .where(where)
    .get();

  const total = countResult?.count ?? 0;

  const entries: LogEntry[] = logs.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    axis: row.axis as LogEntry["axis"],
    level: row.level,
    area: row.area,
    message: row.message,
    data: row.data ? JSON.parse(row.data) : undefined,
  }));

  res.json({ data: { logs: entries, total, page, limit } });
});

// --- DELETE /logs --- Manual purge
router.delete("/logs", (req, res) => {
  const olderThanDays = Number(req.body?.olderThanDays) || 0;

  let deleted: number;
  if (olderThanDays > 0) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = db
      .delete(schema.logs)
      .where(sql`${schema.logs.timestamp} < ${cutoff}`)
      .run();
    deleted = result.changes;
  } else {
    // Purge all
    const result = db.delete(schema.logs).run();
    deleted = result.changes;
  }

  res.json({ data: { deleted } });
});

// --- GET /logs/configs --- Get all per-area log configs
router.get("/logs/configs", (_req, res) => {
  const configs = getAllConfigs();
  res.json({ data: configs });
});

// --- PUT /logs/configs/:area --- Update config for an area
const configSchema = z.object({
  userLevel: z.enum(["silent", "low", "medium", "high"]),
  devLevel: z.enum(["silent", "debug", "verbose"]),
});

router.put("/logs/configs/:area", (req, res) => {
  const { area } = req.params;
  if (!area) {
    res.status(400).json({ error: "Area is required" });
    return;
  }

  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  setAreaConfig(area, parsed.data.userLevel, parsed.data.devLevel);
  res.json({ data: { area, ...parsed.data } });
});

// --- GET /logs/settings --- Get global log settings
router.get("/logs/settings", (_req, res) => {
  const settings = getLogSettings();
  res.json({ data: settings });
});

// --- PUT /logs/settings --- Update global log settings
const settingsSchema = z.object({
  pruneDays: z.number().int().min(1).max(365),
});

router.put("/logs/settings", (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  setLogSettings(parsed.data.pruneDays);
  res.json({ data: { pruneDays: parsed.data.pruneDays } });
});

// --- GET /logs/areas --- List known areas
router.get("/logs/areas", (_req, res) => {
  const areas = getKnownAreas();
  res.json({ data: areas });
});

export const logRouter = router;
