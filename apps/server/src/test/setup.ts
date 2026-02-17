/**
 * Test helper: creates an in-memory SQLite DB with the full schema,
 * and returns a Drizzle instance + Express app wired to the given router.
 *
 * Each test file calls `createTestDb()` in beforeEach to get a fresh DB.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import express, { type Router } from "express";
import http from "node:http";
import * as schema from "../db/schema.js";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Apply the same schema as migrate.ts
  sqlite.exec(`
    CREATE TABLE providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('openai', 'anthropic', 'google', 'openrouter')),
      api_key TEXT NOT NULL,
      base_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      usage TEXT,
      tool_calls TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE plugin_configs (
      plugin_id TEXT PRIMARY KEY,
      config TEXT NOT NULL DEFAULT '{}',
      is_enabled INTEGER NOT NULL DEFAULT 0,
      allow_without_asking INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      axis TEXT NOT NULL CHECK(axis IN ('user', 'dev')),
      level TEXT NOT NULL,
      area TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE log_configs (
      area TEXT PRIMARY KEY,
      user_level TEXT NOT NULL DEFAULT 'medium',
      dev_level TEXT NOT NULL DEFAULT 'debug',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE log_settings (
      id INTEGER PRIMARY KEY,
      prune_days INTEGER NOT NULL DEFAULT 7,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('cron', 'interval', 'webhook', 'manual')),
      trigger_config TEXT NOT NULL DEFAULT '{}',
      action_prompt TEXT NOT NULL,
      tools TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      result TEXT,
      error TEXT,
      usage TEXT
    );

    CREATE TABLE trigger_state (
      trigger_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT '{}',
      last_poll_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE channel_configs (
      channel_id TEXT PRIMARY KEY,
      config TEXT NOT NULL DEFAULT '{}',
      is_enabled INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE channel_sessions (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      external_chat_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE inbox (
      id TEXT PRIMARY KEY,
      task_run_id TEXT REFERENCES task_runs(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('task_result', 'schedule_result', 'notification')),
      is_read INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { db, schema, sqlite };
}

/**
 * Creates a minimal Express app with JSON parsing and the given router
 * mounted at /api, plus an HTTP test client for making requests.
 */
export function createTestApp(router: Router) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const server = http.createServer(app);
  let port = 0;
  let baseUrl = "";

  const ready = new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
      }
      resolve();
    });
  });

  async function request(path: string, opts?: RequestInit) {
    await ready;
    return fetch(`${baseUrl}${path}`, opts);
  }

  function close() {
    server.close();
  }

  return { app, request, close, server };
}
