import { Router } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { scheduler, executeTask } from "../scheduler/index.js";
import type { Task, TaskRun } from "@talos/shared/types";

const router = Router();

// --- Helpers ---

type TaskRow = typeof schema.tasks.$inferSelect;
type TaskRunRow = typeof schema.taskRuns.$inferSelect;

function toTaskResponse(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger_type: row.triggerType,
    trigger_config: row.triggerConfig,
    action_prompt: row.actionPrompt,
    tools: row.tools,
    is_active: row.isActive,
    last_run_at: row.lastRunAt,
    next_run_at: row.nextRunAt,
    created_at: row.createdAt,
  };
}

function toTaskRunResponse(row: TaskRunRow): TaskRun {
  return {
    id: row.id,
    task_id: row.taskId,
    status: row.status,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    result: row.result,
    error: row.error,
  };
}

// --- Zod Schemas ---

const createTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger_type: z.enum(["cron", "interval", "webhook", "manual"]),
  trigger_config: z.string().min(1),
  action_prompt: z.string().min(1),
  tools: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  trigger_type: z.enum(["cron", "interval", "webhook", "manual"]).optional(),
  trigger_config: z.string().min(1).optional(),
  action_prompt: z.string().min(1).optional(),
  tools: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// --- Routes ---

// GET /api/tasks
router.get("/tasks", (_req, res) => {
  const rows = db.select().from(schema.tasks).all();
  res.json({ data: rows.map(toTaskResponse) });
});

// POST /api/tasks
router.post("/tasks", (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { name, description, trigger_type, trigger_config, action_prompt, tools, is_active } = parsed.data;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const active = is_active ?? true;

  db.insert(schema.tasks)
    .values({
      id,
      name,
      description: description ?? null,
      triggerType: trigger_type,
      triggerConfig: trigger_config,
      actionPrompt: action_prompt,
      tools: tools ? JSON.stringify(tools) : null,
      isActive: active,
      createdAt: now,
    })
    .run();

  const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
  if (!row) {
    res.status(500).json({ error: "Failed to create task" });
    return;
  }

  // Schedule if active
  if (active) {
    scheduler.scheduleTask(row);
  }

  res.status(201).json({ data: toTaskResponse(row) });
});

// GET /api/tasks/:id
router.get("/tasks/:id", (req, res) => {
  const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, req.params["id"]!)).get();
  if (!row) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Include recent runs
  const runs = db
    .select()
    .from(schema.taskRuns)
    .where(eq(schema.taskRuns.taskId, row.id))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(20)
    .all();

  res.json({
    data: {
      ...toTaskResponse(row),
      runs: runs.map(toTaskRunResponse),
    },
  });
});

// PUT /api/tasks/:id
router.put("/tasks/:id", (req, res) => {
  const taskId = req.params["id"]!;
  const existing = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const updates: Record<string, unknown> = {};
  const data = parsed.data;
  if (data.name !== undefined) updates["name"] = data.name;
  if (data.description !== undefined) updates["description"] = data.description;
  if (data.trigger_type !== undefined) updates["triggerType"] = data.trigger_type;
  if (data.trigger_config !== undefined) updates["triggerConfig"] = data.trigger_config;
  if (data.action_prompt !== undefined) updates["actionPrompt"] = data.action_prompt;
  if (data.tools !== undefined) updates["tools"] = JSON.stringify(data.tools);
  if (data.is_active !== undefined) updates["isActive"] = data.is_active;

  if (Object.keys(updates).length > 0) {
    db.update(schema.tasks)
      .set(updates)
      .where(eq(schema.tasks.id, taskId))
      .run();
  }

  const updated = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get()!;

  // Reschedule
  scheduler.rescheduleTask(updated);

  res.json({ data: toTaskResponse(updated) });
});

// DELETE /api/tasks/:id
router.delete("/tasks/:id", (req, res) => {
  const taskId = req.params["id"]!;
  const existing = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  scheduler.unscheduleTask(taskId);

  db.delete(schema.tasks).where(eq(schema.tasks.id, taskId)).run();

  res.json({ data: { success: true } });
});

// POST /api/tasks/:id/run — Manual trigger
router.post("/tasks/:id/run", (req, res) => {
  const taskId = req.params["id"]!;
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Fire and forget — return 202 immediately
  executeTask(task).catch(() => {
    // Errors are handled inside executeTask
  });

  res.status(202).json({ data: { message: "Task execution started" } });
});

// GET /api/tasks/:id/runs — Run history
router.get("/tasks/:id/runs", (req, res) => {
  const taskId = req.params["id"]!;
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const runs = db
    .select()
    .from(schema.taskRuns)
    .where(eq(schema.taskRuns.taskId, taskId))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(50)
    .all();

  res.json({ data: runs.map(toTaskRunResponse) });
});

export const taskRouter = router;
