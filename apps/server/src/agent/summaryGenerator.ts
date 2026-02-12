import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider } from "../providers/llm.js";
import { broadcastInbox } from "../ws/index.js";
import { createLogger } from "../logger/index.js";
import type { InboxItem } from "@talos/shared/types";

const log = createLogger("summary-gen");

const SUMMARY_SYSTEM_PROMPT =
  "Summarize this task result in one concise sentence (under 80 characters). Be specific and descriptive about what happened. Output only the summary, nothing else.";

export async function generateInboxSummary(
  inboxId: string,
  taskName: string,
  content: string,
): Promise<void> {
  try {
    const active = getActiveProvider();
    if (!active) {
      log.dev.debug("No active provider, skipping summary generation");
      return;
    }

    const truncatedContent = content.slice(0, 2000);

    const { text } = await generateText({
      model: active.model,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Task: ${taskName}\n\nResult:\n${truncatedContent}` },
      ],
    });

    const summary = text.trim();
    if (!summary) {
      log.dev.debug("Summary generation returned empty text");
      return;
    }

    db.update(schema.inbox)
      .set({ summary })
      .where(eq(schema.inbox.id, inboxId))
      .run();

    // Re-read the full row and broadcast the updated item
    const row = db.select().from(schema.inbox).where(eq(schema.inbox.id, inboxId)).get();
    if (row) {
      const item: InboxItem = {
        id: row.id,
        task_run_id: row.taskRunId,
        title: row.title,
        summary: row.summary,
        content: row.content,
        type: row.type,
        is_read: row.isRead,
        is_pinned: row.isPinned,
        created_at: row.createdAt,
      };
      broadcastInbox(item);
    }

    log.dev.debug("Generated inbox summary", { inboxId, summary });
  } catch (err: unknown) {
    log.dev.debug("Summary generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
