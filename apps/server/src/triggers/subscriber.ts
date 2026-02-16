import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getTrigger, isRegisteredTrigger } from "./registry.js";
import { executeTask } from "../scheduler/executor.js";
import { createLogger } from "../logger/index.js";
import type { TriggerEvent } from "@talos/shared/types";
import type { RegisteredTrigger } from "./registry.js";
import type { TriggerContext } from "./poller.js";

const log = createLogger("triggers");

type TaskRow = typeof schema.tasks.$inferSelect;

const DEFAULT_COOLDOWN_SECONDS = 60;

const activeSubscriptions = new Map<string, () => void>();
const lastDispatch = new Map<string, number>();

function getPluginConfig(pluginId: string): Record<string, string> {
  const row = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();
  if (!row?.config) return {};
  return JSON.parse(row.config) as Record<string, string>;
}

function getActiveTasksForTrigger(triggerType: string): TaskRow[] {
  return db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.isActive, true))
    .all()
    .filter((t) => t.triggerType === triggerType);
}

function getCooldownSeconds(task: TaskRow): number {
  try {
    const config = JSON.parse(task.triggerConfig) as Record<string, unknown>;
    const val = config["cooldown_seconds"];
    if (typeof val === "number" && val > 0) return val;
  } catch {
    // invalid config
  }
  return DEFAULT_COOLDOWN_SECONDS;
}

function dispatchEvent(reg: RegisteredTrigger, event: TriggerEvent): void {
  const tasks = getActiveTasksForTrigger(reg.fullId);
  if (tasks.length === 0) return;

  const triggerContext: TriggerContext = {
    triggerId: reg.fullId,
    summary: event.summary,
    data: event.data,
  };

  for (const task of tasks) {
    // Apply filter if handler has one
    if (reg.handler.filter) {
      try {
        const taskConfig = JSON.parse(task.triggerConfig) as Record<string, unknown>;
        if (!reg.handler.filter(event, taskConfig)) continue;
      } catch {
        // invalid config — skip filter
      }
    }

    // Apply cooldown
    const cooldownKey = `${reg.fullId}:${task.id}`;
    const now = Date.now();
    const last = lastDispatch.get(cooldownKey);
    const cooldownMs = getCooldownSeconds(task) * 1000;

    if (last && now - last < cooldownMs) {
      log.dev.debug(`Cooldown active for ${cooldownKey}, skipping`);
      continue;
    }

    lastDispatch.set(cooldownKey, now);

    executeTask(task, triggerContext).catch((err: unknown) => {
      log.error(`Failed to execute task "${task.name}" for subscription ${reg.fullId}`, {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  log.info(`Subscription ${reg.fullId} fired, dispatched to ${tasks.length} task(s)`, {
    summary: event.summary,
  });
}

async function startSubscription(reg: RegisteredTrigger): Promise<void> {
  if (activeSubscriptions.has(reg.fullId)) return;
  if (!reg.handler.subscribe) return;

  const config = getPluginConfig(reg.pluginId);

  try {
    const unsubscribe = await reg.handler.subscribe(config, config, (event) => {
      dispatchEvent(reg, event);
    });

    activeSubscriptions.set(reg.fullId, unsubscribe);
    log.info(`Started subscription for ${reg.fullId}`);
  } catch (err: unknown) {
    log.error(`Failed to start subscription for ${reg.fullId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function stopSubscription(fullId: string): void {
  const unsubscribe = activeSubscriptions.get(fullId);
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch (err: unknown) {
      log.error(`Error stopping subscription for ${fullId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    activeSubscriptions.delete(fullId);
    log.info(`Stopped subscription for ${fullId}`);
  }
}

function refreshAll(): void {
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

  // Start subscriptions for triggers that have active tasks and subscribe()
  for (const triggerType of activeTriggerTypes) {
    const reg = getTrigger(triggerType);
    if (reg && reg.handler.subscribe && !activeSubscriptions.has(triggerType)) {
      startSubscription(reg).catch(() => {});
    }
  }

  // Stop subscriptions for triggers that no longer have active tasks
  for (const fullId of [...activeSubscriptions.keys()]) {
    if (!activeTriggerTypes.has(fullId)) {
      stopSubscription(fullId);
    }
  }
}

function init(): void {
  refreshAll();
  log.info(`Trigger subscriber initialized (${activeSubscriptions.size} active subscription(s))`);
}

function shutdown(): void {
  for (const fullId of [...activeSubscriptions.keys()]) {
    stopSubscription(fullId);
  }
  lastDispatch.clear();
  log.info("Trigger subscriber shut down");
}

export const triggerSubscriber = {
  init,
  shutdown,
  refreshAll,
};
