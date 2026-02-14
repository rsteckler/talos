import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { executeTask } from "./executor.js";
import { createLogger } from "../logger/index.js";
import { triggerPoller, triggerSubscriber } from "../triggers/index.js";

const log = createLogger("scheduler");

type TaskRow = typeof schema.tasks.$inferSelect;

interface ScheduledJob {
  type: "cron" | "interval";
  cronTask?: cron.ScheduledTask;
  intervalId?: ReturnType<typeof setInterval>;
}

const jobs = new Map<string, ScheduledJob>();
const runningTasks = new Set<string>();

/**
 * Compute the next run time for a cron expression.
 * Returns ISO string or null if invalid.
 */
function computeNextRunAt(triggerType: string, triggerConfig: string): string | null {
  try {
    const config = JSON.parse(triggerConfig) as Record<string, unknown>;

    if (triggerType === "cron" && typeof config["cron"] === "string") {
      const expr = CronExpressionParser.parse(config["cron"] as string);
      return expr.next().toDate().toISOString();
    }

    if (triggerType === "interval" && typeof config["interval_minutes"] === "number") {
      const minutes = config["interval_minutes"] as number;
      return new Date(Date.now() + minutes * 60_000).toISOString();
    }
  } catch {
    // Invalid config
  }
  return null;
}

function scheduleTask(task: TaskRow): void {
  // Unschedule first if already scheduled
  unscheduleTask(task.id);

  if (!task.isActive) {
    triggerPoller.refreshAll();
    triggerSubscriber.refreshAll();
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(task.triggerConfig) as Record<string, unknown>;
  } catch {
    log.warn(`Invalid trigger config for task "${task.name}"`, { taskId: task.id });
    return;
  }

  if (task.triggerType === "cron") {
    const expression = config["cron"];
    if (typeof expression !== "string" || !cron.validate(expression)) {
      log.warn(`Invalid cron expression for task "${task.name}": ${String(expression)}`, { taskId: task.id });
      return;
    }

    const cronTask = cron.schedule(expression, () => {
      if (runningTasks.has(task.id)) {
        log.warn(`Skipping task "${task.name}" — previous run still in progress`, { taskId: task.id });
        return;
      }
      runningTasks.add(task.id);
      executeTask(task)
        .catch((err: unknown) => {
          log.error(`Unhandled error executing task "${task.name}"`, {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          runningTasks.delete(task.id);
          const nextRunAt = computeNextRunAt(task.triggerType, task.triggerConfig);
          if (nextRunAt) {
            db.update(schema.tasks)
              .set({ nextRunAt })
              .where(eq(schema.tasks.id, task.id))
              .run();
          }
        });
    });

    jobs.set(task.id, { type: "cron", cronTask });

    // Persist initial nextRunAt
    const cronNextRunAt = computeNextRunAt(task.triggerType, task.triggerConfig);
    if (cronNextRunAt) {
      db.update(schema.tasks)
        .set({ nextRunAt: cronNextRunAt })
        .where(eq(schema.tasks.id, task.id))
        .run();
    }

    log.info(`Scheduled cron task "${task.name}" with expression "${expression}"`, { taskId: task.id });
  } else if (task.triggerType === "interval") {
    const minutes = config["interval_minutes"];
    if (typeof minutes !== "number" || minutes <= 0) {
      log.warn(`Invalid interval for task "${task.name}": ${String(minutes)}`, { taskId: task.id });
      return;
    }

    const ms = minutes * 60_000;
    const intervalId = setInterval(() => {
      if (runningTasks.has(task.id)) {
        log.warn(`Skipping task "${task.name}" — previous run still in progress`, { taskId: task.id });
        return;
      }
      runningTasks.add(task.id);
      executeTask(task)
        .catch((err: unknown) => {
          log.error(`Unhandled error executing task "${task.name}"`, {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          runningTasks.delete(task.id);
          const nextRunAt = new Date(Date.now() + ms).toISOString();
          db.update(schema.tasks)
            .set({ nextRunAt })
            .where(eq(schema.tasks.id, task.id))
            .run();
        });
    }, ms);

    jobs.set(task.id, { type: "interval", intervalId });

    // Update next_run_at
    const nextRunAt = new Date(Date.now() + ms).toISOString();
    db.update(schema.tasks)
      .set({ nextRunAt })
      .where(eq(schema.tasks.id, task.id))
      .run();

    log.info(`Scheduled interval task "${task.name}" every ${minutes} minute(s)`, { taskId: task.id });
  }
  // webhook, manual, and tool-provided triggers have no cron/interval schedule here
  // Tool triggers are handled by the trigger poller

  triggerPoller.refreshAll();
  triggerSubscriber.refreshAll();
}

function unscheduleTask(taskId: string): void {
  const job = jobs.get(taskId);
  if (!job) {
    triggerPoller.refreshAll();
    triggerSubscriber.refreshAll();
    return;
  }

  if (job.type === "cron" && job.cronTask) {
    job.cronTask.stop();
  } else if (job.type === "interval" && job.intervalId) {
    clearInterval(job.intervalId);
  }

  jobs.delete(taskId);
  triggerPoller.refreshAll();
  triggerSubscriber.refreshAll();
}

function rescheduleTask(task: TaskRow): void {
  unscheduleTask(task.id);
  scheduleTask(task);
}

function init(): void {
  const activeTasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.isActive, true))
    .all();

  for (const task of activeTasks) {
    scheduleTask(task);
  }

  log.info(`Scheduler initialized with ${activeTasks.length} active task(s)`);
}

function shutdown(): void {
  for (const taskId of jobs.keys()) {
    unscheduleTask(taskId);
  }
  log.info("Scheduler shut down");
}

function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}

export const scheduler = {
  init,
  shutdown,
  scheduleTask,
  unscheduleTask,
  rescheduleTask,
  computeNextRunAt,
  isTaskRunning,
};

export { executeTask } from "./executor.js";
