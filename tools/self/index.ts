/** Self Knowledge tool — read and write Talos's own prompt documents. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
interface ToolLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "apps", "server", "data");
const DB_PATH = path.join(DATA_DIR, "talos.db");

// Resolve better-sqlite3 from the server package
const serverDir = path.join(__dirname, "..", "..", "apps", "server");
const require = createRequire(path.join(serverDir, "package.json"));
const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;

const DOCUMENTS: Record<string, string> = {
  soul: path.join(DATA_DIR, "SOUL.md"),
  tools: path.join(DATA_DIR, "TOOLS.md"),
  human: path.join(DATA_DIR, "HUMAN.md"),
};

function resolveDocument(name: unknown): { path: string } | { error: string } {
  if (typeof name !== "string" || !DOCUMENTS[name]) {
    return { error: `Unknown document: "${String(name)}". Must be one of: soul, tools, human.` };
  }
  return { path: DOCUMENTS[name] };
}

async function read_document(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveDocument(args["document"]);
  if ("error" in resolved) return resolved;

  try {
    const content = fs.readFileSync(resolved.path, "utf-8");
    return { document: args["document"], content };
  } catch {
    return { document: args["document"], content: "" };
  }
}

async function write_document(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveDocument(args["document"]);
  if ("error" in resolved) return resolved;

  const content = args["content"];
  if (typeof content !== "string") {
    return { error: "content must be a string" };
  }

  try {
    fs.writeFileSync(resolved.path, content, "utf-8");
    return { success: true, document: args["document"] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to write document" };
  }
}

const DAILY_REVIEW_TASK_NAME = "Daily Self-Reflection";

const DAILY_REVIEW_PROMPT = `You are running a scheduled daily self-reflection task. Review the last 24 hours of conversations and update your knowledge documents.

## Steps

1. Use \`chat-history_recent_conversations\` to get all conversations from the last 24 hours.
2. For each conversation, use \`chat-history_get_conversation\` to read the full exchange.
3. Use \`self_read_document\` to read the current "human" and "soul" documents.
4. Analyze the conversations for:
   - **About the human**: New personal details, preferences, interests, recurring topics, communication style preferences, things they asked you to remember, projects they're working on, or any other useful context.
   - **About your behavior**: Moments where the human responded very positively or negatively to your tone, style, or approach. Patterns in what kind of responses work best. Any explicit or implicit feedback about how you should behave differently.
5. Use \`self_write_document\` to update the "human" document, merging new observations with existing content. Keep it well-organized with headings. Never remove existing information unless it's clearly outdated or contradicted.
6. If you identified meaningful behavioral adjustments, use \`self_write_document\` to update the "soul" document. Be conservative — only add guidance that you're confident will improve future interactions. Preserve the existing structure and tone of the document.

## Guidelines

- If there were no conversations in the last 24 hours, simply note that and skip updates.
- Be specific in your notes. "User prefers concise answers" is better than "User has preferences."
- For SOUL.md changes, phrase adjustments as positive instructions ("Be direct and concise") rather than negatives ("Don't be verbose").
- Summarize what you updated in your final response so it appears in the inbox.`;

export function init(logger: ToolLogger): void {
  try {
    const db = new Database(DB_PATH);
    try {
      // Check if the daily review task already exists
      const existing = db.prepare(
        "SELECT id FROM tasks WHERE name = ?"
      ).get(DAILY_REVIEW_TASK_NAME) as { id: string } | undefined;

      if (!existing) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          `INSERT INTO tasks (id, name, description, trigger_type, trigger_config, action_prompt, tools, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          DAILY_REVIEW_TASK_NAME,
          "Reviews the last 24 hours of conversations and updates HUMAN.md with observations about the user and SOUL.md with behavioral adjustments.",
          "cron",
          JSON.stringify({ cron: "0 3 * * *" }),  // 3:00 AM daily
          DAILY_REVIEW_PROMPT,
          JSON.stringify(["chat-history", "self", "datetime"]),
          1,  // is_active = true
          now,
        );

        logger.info("Created daily self-reflection task (runs at 3:00 AM)");
      }
    } finally {
      db.close();
    }
  } catch (err) {
    logger.error(`Failed to seed daily review task: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const handlers = { read_document, write_document };
