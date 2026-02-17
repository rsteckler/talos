import { generateText, stepCountIs } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider, loadSystemPrompt } from "../providers/llm.js";
import { buildPluginToolSet } from "../plugins/runner.js";
import { createLogger } from "../logger/index.js";
import { broadcastInbox, broadcastStatus } from "../ws/index.js";
import { generateInboxSummary } from "../agent/summaryGenerator.js";
import { notifyChannels } from "../channels/index.js";
import type { InboxItem, TokenUsage } from "@talos/shared/types";
import type { TriggerContext } from "../triggers/index.js";

const log = createLogger("scheduler");

type TaskRow = typeof schema.tasks.$inferSelect;

export async function executeTask(task: TaskRow, triggerContext?: TriggerContext): Promise<void> {
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
  broadcastStatus("thinking");

  try {
    const active = getActiveProvider();
    if (!active) {
      throw new Error("No active model configured");
    }

    const systemPrompt = loadSystemPrompt();

    // Build plugin tool set — filter to specific plugins if specified
    const filterPluginIds = task.tools ? (JSON.parse(task.tools) as string[]) : undefined;
    const { tools, pluginPrompts } = buildPluginToolSet(filterPluginIds);
    const hasTools = Object.keys(tools).length > 0;

    const fullSystemPrompt = pluginPrompts.length > 0
      ? `${systemPrompt}\n\n${pluginPrompts.join("\n\n")}`
      : systemPrompt;

    // Prepend trigger context to the action prompt if present
    const userContent = triggerContext?.summary
      ? `[Trigger: ${triggerContext.summary}]\n---\n${task.actionPrompt}`
      : task.actionPrompt;

    const result = await generateText({
      model: active.model,
      system: fullSystemPrompt,
      messages: [{ role: "user", content: userContent }],
      ...(hasTools ? { tools, stopWhen: stepCountIs(10) } : {}),
    });

    // Capture token usage
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const taskUsage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };

    // For OpenRouter: attempt to fetch cost from generation stats
    if (active.providerType === "openrouter") {
      try {
        const generationId = result.response.headers?.["x-openrouter-generation-id"];
        if (generationId && active.apiKey) {
          const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
            headers: { Authorization: `Bearer ${active.apiKey}` },
          });
          if (genRes.ok) {
            const genData = await genRes.json() as { data?: { total_cost?: number } };
            if (genData.data?.total_cost != null) {
              taskUsage.cost = genData.data.total_cost;
            }
          }
        }
      } catch {
        // Cost fetching is best-effort
      }
    }

    const completedAt = new Date().toISOString();

    // Update task_run as completed
    db.update(schema.taskRuns)
      .set({
        status: "completed",
        completedAt,
        result: result.text || null,
        usage: taskUsage.totalTokens > 0 ? JSON.stringify(taskUsage) : null,
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
      title: task.name,
      content: result.text || "(no output)",
      type: "task_result",
      is_read: false,
      is_pinned: false,
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
    broadcastStatus("idle");

    // Push notification to external channels
    notifyChannels(inboxItem).catch((err: unknown) =>
      log.dev.debug("Channel notification failed", { error: err instanceof Error ? err.message : String(err) })
    );

    // Fire-and-forget summary generation — updates inbox item async via WS
    generateInboxSummary(inboxItem.id, task.name, result.text || "").catch((err: unknown) =>
      log.dev.debug("Summary generation failed", { error: err instanceof Error ? err.message : String(err) })
    );

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
      is_pinned: false,
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
    broadcastStatus("idle");

    // Push failure notification to external channels
    notifyChannels(inboxItem).catch((err2: unknown) =>
      log.dev.debug("Channel notification failed", { error: err2 instanceof Error ? err2.message : String(err2) })
    );

    log.error(`Task "${task.name}" failed`, { taskId: task.id, runId, error: errorMessage });
  }
}
