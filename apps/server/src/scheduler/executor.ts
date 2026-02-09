import { generateText, stepCountIs } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider, loadSystemPrompt } from "../providers/llm.js";
import { buildToolSet } from "../tools/runner.js";
import { createLogger } from "../logger/index.js";
import { broadcastInbox } from "../ws/index.js";
import type { InboxItem } from "@talos/shared/types";

const log = createLogger("scheduler");

type TaskRow = typeof schema.tasks.$inferSelect;

export async function executeTask(task: TaskRow): Promise<void> {
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create task_run record
  db.insert(schema.taskRuns)
    .values({
      id: runId,
      taskId: task.id,
      status: "running",
      startedAt: now,
    })
    .run();

  log.info(`Executing task "${task.name}"`, { taskId: task.id, runId });

  try {
    const active = getActiveProvider();
    if (!active) {
      throw new Error("No active model configured");
    }

    const systemPrompt = loadSystemPrompt();

    // Build tool set — filter to specific tools if specified
    const filterToolIds = task.tools ? (JSON.parse(task.tools) as string[]) : undefined;
    const { tools, toolPrompts } = buildToolSet(filterToolIds);
    const hasTools = Object.keys(tools).length > 0;

    const fullSystemPrompt = toolPrompts.length > 0
      ? `${systemPrompt}\n\n${toolPrompts.join("\n\n")}`
      : systemPrompt;

    const result = await generateText({
      model: active.model,
      system: fullSystemPrompt,
      messages: [{ role: "user", content: task.actionPrompt }],
      ...(hasTools ? { tools, stopWhen: stepCountIs(10) } : {}),
    });

    const completedAt = new Date().toISOString();

    // Update task_run as completed
    db.update(schema.taskRuns)
      .set({
        status: "completed",
        completedAt,
        result: result.text || null,
      })
      .where(eq(schema.taskRuns.id, runId))
      .run();

    // Update task last_run_at
    db.update(schema.tasks)
      .set({ lastRunAt: completedAt })
      .where(eq(schema.tasks.id, task.id))
      .run();

    // Create inbox item
    const inboxItem: InboxItem = {
      id: crypto.randomUUID(),
      task_run_id: runId,
      title: `Task completed: ${task.name}`,
      content: result.text || "(no output)",
      type: "task_result",
      is_read: false,
      created_at: completedAt,
    };

    db.insert(schema.inbox)
      .values({
        id: inboxItem.id,
        taskRunId: inboxItem.task_run_id ?? null,
        title: inboxItem.title,
        content: inboxItem.content,
        type: inboxItem.type,
        isRead: false,
        createdAt: inboxItem.created_at,
      })
      .run();

    // Broadcast to connected WS clients
    broadcastInbox(inboxItem);

    log.info(`Task "${task.name}" completed`, { taskId: task.id, runId, resultLength: result.text.length });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const completedAt = new Date().toISOString();

    // Update task_run as failed
    db.update(schema.taskRuns)
      .set({
        status: "failed",
        completedAt,
        error: errorMessage,
      })
      .where(eq(schema.taskRuns.id, runId))
      .run();

    // Update task last_run_at even on failure
    db.update(schema.tasks)
      .set({ lastRunAt: completedAt })
      .where(eq(schema.tasks.id, task.id))
      .run();

    // Create inbox item for failure
    const inboxItem: InboxItem = {
      id: crypto.randomUUID(),
      task_run_id: runId,
      title: `Task failed: ${task.name}`,
      content: `Error: ${errorMessage}`,
      type: "task_result",
      is_read: false,
      created_at: completedAt,
    };

    db.insert(schema.inbox)
      .values({
        id: inboxItem.id,
        taskRunId: inboxItem.task_run_id ?? null,
        title: inboxItem.title,
        content: inboxItem.content,
        type: inboxItem.type,
        isRead: false,
        createdAt: inboxItem.created_at,
      })
      .run();

    broadcastInbox(inboxItem);

    log.error(`Task "${task.name}" failed`, { taskId: task.id, runId, error: errorMessage });
  }
}
