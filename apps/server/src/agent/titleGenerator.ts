import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getActiveProvider } from "../providers/llm.js";
import { broadcastConversationTitleUpdate } from "../ws/index.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("title-gen");

const TITLE_SYSTEM_PROMPT =
  "Generate a short conversational title (5-8 words max) for the following exchange. Return ONLY the title text, no quotes, no punctuation at the end.";

export async function generateConversationTitle(
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  try {
    const active = getActiveProvider();
    if (!active) {
      log.dev.debug("No active provider, skipping title generation");
      return;
    }

    const truncatedAssistant = assistantMessage.slice(0, 500);

    const { text } = await generateText({
      model: active.model,
      system: TITLE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: truncatedAssistant },
      ],
    });

    const title = text.trim().replace(/^["']|["']$/g, "");
    if (!title) {
      log.dev.debug("Title generation returned empty text");
      return;
    }

    db.update(schema.conversations)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(schema.conversations.id, conversationId))
      .run();

    broadcastConversationTitleUpdate(conversationId, title);
    log.dev.debug("Generated title", { conversationId, title });
  } catch (err: unknown) {
    log.dev.debug("Title generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
