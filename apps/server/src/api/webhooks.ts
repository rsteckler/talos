import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { executeTask } from "../scheduler/index.js";

const router = Router();

// POST /api/webhooks/:task_id
router.post("/webhooks/:task_id", (req, res) => {
  const taskId = req.params["task_id"]!;
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (task.triggerType !== "webhook") {
    res.status(400).json({ error: "Task is not a webhook-triggered task" });
    return;
  }

  if (!task.isActive) {
    res.status(400).json({ error: "Task is not active" });
    return;
  }

  // Fire and forget
  executeTask(task).catch(() => {
    // Errors handled inside executeTask
  });

  res.status(202).json({ data: { message: "Webhook received, task execution started" } });
});

export const webhookRouter = router;
