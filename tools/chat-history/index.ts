/** Chat History tool — search and browse past conversations. */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "apps", "server", "data", "talos.db");

// Resolve better-sqlite3 from the server package where it's installed
const serverDir = path.join(__dirname, "..", "..", "apps", "server");
const require = createRequire(path.join(serverDir, "package.json"));
const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;

type SqliteDb = InstanceType<typeof Database>;

function getDb(): SqliteDb {
  return new Database(DB_PATH, { readonly: true });
}

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

async function list_conversations(args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(100, Math.max(1, Number(args["limit"]) || 20));
  const offset = Math.max(0, Number(args["offset"]) || 0);
  const after = typeof args["after"] === "string" ? args["after"] : null;
  const before = typeof args["before"] === "string" ? args["before"] : null;

  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (after) {
      conditions.push("updated_at > ?");
      params.push(after);
    }
    if (before) {
      conditions.push("updated_at < ?");
      params.push(before);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db.prepare(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       ${where}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as ConversationRow[];

    const total = (db.prepare(`SELECT count(*) as count FROM conversations ${where}`).get(...params) as { count: number }).count;

    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updated_at,
        createdAt: r.created_at,
      })),
      total,
      limit,
      offset,
    };
  } finally {
    db.close();
  }
}

async function recent_conversations(args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(100, Math.max(1, Number(args["limit"]) || 50));
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE updated_at > ?
       ORDER BY updated_at DESC
       LIMIT ?`
    ).all(cutoff, limit) as ConversationRow[];

    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updated_at,
        createdAt: r.created_at,
      })),
      since: cutoff,
    };
  } finally {
    db.close();
  }
}

async function search_conversations(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args["query"] ?? "");
  if (!query) return { error: "query is required" };

  const limit = Math.min(100, Math.max(1, Number(args["limit"]) || 20));
  const pattern = `%${query}%`;

  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE title LIKE ?
       ORDER BY updated_at DESC
       LIMIT ?`
    ).all(pattern, limit) as ConversationRow[];

    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updated_at,
        createdAt: r.created_at,
      })),
      query,
    };
  } finally {
    db.close();
  }
}

async function search_messages(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args["query"] ?? "");
  if (!query) return { error: "query is required" };

  const role = typeof args["role"] === "string" ? args["role"] : null;
  const after = typeof args["after"] === "string" ? args["after"] : null;
  const before = typeof args["before"] === "string" ? args["before"] : null;
  const limit = Math.min(100, Math.max(1, Number(args["limit"]) || 20));
  const pattern = `%${query}%`;

  const db = getDb();
  try {
    const conditions: string[] = ["m.content LIKE ?"];
    const params: unknown[] = [pattern];

    if (role) {
      conditions.push("m.role = ?");
      params.push(role);
    }
    if (after) {
      conditions.push("m.created_at > ?");
      params.push(after);
    }
    if (before) {
      conditions.push("m.created_at < ?");
      params.push(before);
    }

    const where = conditions.join(" AND ");

    const rows = db.prepare(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at,
              c.title as conversation_title
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT ?`
    ).all(...params, limit) as (MessageRow & { conversation_title: string })[];

    return {
      messages: rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        conversationTitle: r.conversation_title,
        role: r.role,
        snippet: buildSnippet(r.content, query, 200),
        createdAt: r.created_at,
      })),
      query,
    };
  } finally {
    db.close();
  }
}

async function get_conversation(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = String(args["conversation_id"] ?? "");
  if (!conversationId) return { error: "conversation_id is required" };

  const db = getDb();
  try {
    const conversation = db.prepare(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?"
    ).get(conversationId) as ConversationRow | undefined;

    if (!conversation) return { error: "Conversation not found" };

    const messages = db.prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    ).all(conversationId) as MessageRow[];

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
    };
  } finally {
    db.close();
  }
}

async function get_message(args: Record<string, unknown>): Promise<unknown> {
  const messageId = String(args["message_id"] ?? "");
  if (!messageId) return { error: "message_id is required" };

  const db = getDb();
  try {
    const row = db.prepare(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at,
              c.title as conversation_title
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = ?`
    ).get(messageId) as (MessageRow & { conversation_title: string }) | undefined;

    if (!row) return { error: "Message not found" };

    return {
      id: row.id,
      conversationId: row.conversation_id,
      conversationTitle: row.conversation_title,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    };
  } finally {
    db.close();
  }
}

/**
 * Build a snippet around the first occurrence of the search term.
 * Shows context before and after the match.
 */
function buildSnippet(content: string, query: string, maxLength: number): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());

  if (idx < 0 || content.length <= maxLength) {
    return content.slice(0, maxLength);
  }

  const start = Math.max(0, idx - Math.floor(maxLength / 3));
  const end = Math.min(content.length, start + maxLength);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}

export const handlers = {
  list_conversations,
  recent_conversations,
  search_conversations,
  search_messages,
  get_conversation,
  get_message,
};
