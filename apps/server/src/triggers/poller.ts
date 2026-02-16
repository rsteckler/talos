import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getTrigger, isRegisteredTrigger } from "./registry.js";
import { executeTask } from "../scheduler/executor.js";
import { createLogger } from "../logger/index.js";
import type { RegisteredTrigger } from "./registry.js";

const log = createLogger("triggers");

type TaskRow = typeof schema.tasks.$inferSelect;

export interface TriggerContext {
  triggerId: string;
  summary?: string;
  data?: unknown;
}

const activePollers = new Map<string, ReturnType<typeof setInterval>>();
const pollingNow = new Set<string>();

const DEFAULT_POLL_INTERVAL_MINUTES = 5;

function getPluginConfig(pluginId: string): Record<string, string> {
  const row = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();
  if (!row?.config) return {};
  return JSON.parse(row.config) as Record<string, string>;
}

function getTriggerState(triggerId: string): Record<string, unknown> {
  const row = db
    .select()
    .from(schema.triggerState)
    .where(eq(schema.triggerState.triggerId, triggerId))
    .get();
  if (!row?.state) return {};
  return JSON.parse(row.state) as Record<string, unknown>;
}

function saveTriggerState(triggerId: string, state: Record<string, unknown>): void {
  const now = new Date().toISOString();
  const stateJson = JSON.stringify(state);

  const existing = db
    .select()
    .from(schema.triggerState)
    .where(eq(schema.triggerState.triggerId, triggerId))
    .get();

  if (existing) {
    db.update(schema.triggerState)
      .set({ state: stateJson, lastPollAt: now, updatedAt: now })
      .where(eq(schema.triggerState.triggerId, triggerId))
      .run();
  } else {
    db.insert(schema.triggerState)
      .values({ triggerId, state: stateJson, lastPollAt: now, updatedAt: now })
      .run();
  }
}

function getActiveTasksForTrigger(triggerType: string): TaskRow[] {
  return db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.isActive, true))
    .all()
    .filter((t) => t.triggerType === triggerType);
}

function getPollIntervalMs(reg: RegisteredTrigger, config: Record<string, string>): number {
  // Look for a setting that defines poll interval
  const manifest = reg.spec;
  // Convention: look for a setting ending with _poll_interval_minutes in the tool config
  const intervalKey = Object.keys(config).find((k) => k.includes("poll_interval"));
  if (intervalKey) {
    const val = Number(config[intervalKey]);
    if (val > 0) return val * 60_000;
  }
  return DEFAULT_POLL_INTERVAL_MINUTES * 60_000;
}

async function pollTrigger(reg: RegisteredTrigger): Promise<void> {
  if (pollingNow.has(reg.fullId)) return;
  pollingNow.add(reg.fullId);

  try {
    log.dev.debug(`Polling ${reg.fullId}...`);
    const config = getPluginConfig(reg.pluginId);
    const state = getTriggerState(reg.fullId);
    const handler = reg.handler;

    if (!handler.poll) return;

    const result = await handler.poll(config, state, config);
    saveTriggerState(reg.fullId, result.newState);

    if (result.event) {
      const tasks = getActiveTasksForTrigger(reg.fullId);
      const triggerContext: TriggerContext = {
        triggerId: reg.fullId,
        summary: result.event.summary,
        data: result.event.data,
      };

      for (const task of tasks) {
        if (handler.filter) {
          try {
            const taskConfig = JSON.parse(task.triggerConfig) as Record<string, unknown>;
            if (!handler.filter(result.event, taskConfig)) continue;
          } catch {
            // invalid config — skip filter
          }
        }

        executeTask(task, triggerContext).catch((err: unknown) => {
          log.error(`Failed to execute task "${task.name}" for trigger ${reg.fullId}`, {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      log.info(`Trigger ${reg.fullId} fired, executing ${tasks.length} task(s)`, {
        summary: result.event.summary,
      });
    } else {
      log.dev.debug(`Poll ${reg.fullId}: no new events`);
    }
  } catch (err: unknown) {
    log.error(`Poll failed for trigger ${reg.fullId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    pollingNow.delete(reg.fullId);
  }
}

function startPoller(reg: RegisteredTrigger): void {
  if (activePollers.has(reg.fullId)) return;

  const config = getPluginConfig(reg.pluginId);
  const intervalMs = getPollIntervalMs(reg, config);

  // Do an initial poll after a short delay
  setTimeout(() => {
    pollTrigger(reg).catch(() => {});
  }, 5_000);

  const id = setInterval(() => {
    pollTrigger(reg).catch(() => {});
  }, intervalMs);

  activePollers.set(reg.fullId, id);
  log.info(`Started poller for ${reg.fullId} (every ${intervalMs / 60_000}m)`);
}

function stopPoller(fullId: string): void {
  const id = activePollers.get(fullId);
  if (id) {
    clearInterval(id);
    activePollers.delete(fullId);
    log.info(`Stopped poller for ${fullId}`);
  }
}

function refreshAll(): void {
  // For each registered trigger, check if any active tasks use it
  // Import here to avoid circular dependency issues
  const allTasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.isActive, true))
    .all();

  const activeTriggerTypes = new Set(
    allTasks
      .map((t) => t.triggerType)
      .filter((tt) => isRegisteredTrigger(tt))
  );

  // Start pollers for triggers that have active tasks (skip subscribe-capable)
  for (const triggerType of activeTriggerTypes) {
    const reg = getTrigger(triggerType);
    if (reg && reg.handler.poll && !reg.handler.subscribe && !activePollers.has(triggerType)) {
      startPoller(reg);
    }
  }

  // Stop pollers for triggers that no longer have active tasks
  for (const fullId of activePollers.keys()) {
    if (!activeTriggerTypes.has(fullId)) {
      stopPoller(fullId);
    }
  }
}

function init(): void {
  refreshAll();
  log.info(`Trigger poller initialized (${activePollers.size} active poller(s))`);
}

function shutdown(): void {
  for (const fullId of [...activePollers.keys()]) {
    stopPoller(fullId);
  }
  log.info("Trigger poller shut down");
}

export const triggerPoller = {
  init,
  shutdown,
  refreshAll,
};
