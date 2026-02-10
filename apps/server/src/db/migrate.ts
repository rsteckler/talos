import { db } from "./index.js";

export function runMigrations(): void {
  const raw = db.$client;

  raw.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('openai', 'anthropic', 'google', 'openrouter')),
      api_key TEXT NOT NULL,
      base_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_configs (
      tool_id TEXT PRIMARY KEY,
      config TEXT NOT NULL DEFAULT '{}',
      is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      axis TEXT NOT NULL CHECK(axis IN ('user', 'dev')),
      level TEXT NOT NULL,
      area TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_area ON logs(area);
    CREATE INDEX IF NOT EXISTS idx_logs_axis_level ON logs(axis, level);

    CREATE TABLE IF NOT EXISTS log_configs (
      area TEXT PRIMARY KEY,
      user_level TEXT NOT NULL DEFAULT 'medium',
      dev_level TEXT NOT NULL DEFAULT 'debug',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_settings (
      id INTEGER PRIMARY KEY,
      prune_days INTEGER NOT NULL DEFAULT 7,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
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

    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      result TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_runs_task_id ON task_runs(task_id);

    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      task_run_id TEXT REFERENCES task_runs(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('task_result', 'schedule_result', 'notification')),
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inbox_created_at ON inbox(created_at);
  `);

  // Migrate existing providers table: expand CHECK constraint to include 'openrouter'
  const tableInfo = raw.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='providers'").get() as { sql: string } | undefined;
  if (tableInfo?.sql && !tableInfo.sql.includes("openrouter")) {
    raw.exec("PRAGMA foreign_keys = OFF;");
    raw.exec(`
      CREATE TABLE providers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('openai', 'anthropic', 'google', 'openrouter')),
        api_key TEXT NOT NULL,
        base_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      INSERT INTO providers_new SELECT * FROM providers;
      DROP TABLE providers;
      ALTER TABLE providers_new RENAME TO providers;
    `);
    raw.exec("PRAGMA foreign_keys = ON;");
  }

  // Migrate log_configs: update overly-restrictive defaults from initial deployment
  raw.exec(`
    UPDATE log_configs SET user_level = 'medium', dev_level = 'debug'
    WHERE area = '_default' AND user_level = 'low' AND dev_level = 'silent';
  `);

  // Add usage column to messages and task_runs (stores JSON)
  try { raw.exec("ALTER TABLE messages ADD COLUMN usage TEXT;"); } catch { /* column already exists */ }
  try { raw.exec("ALTER TABLE task_runs ADD COLUMN usage TEXT;"); } catch { /* column already exists */ }

  // Add allow_without_asking column to tool_configs
  try { raw.exec("ALTER TABLE tool_configs ADD COLUMN allow_without_asking INTEGER NOT NULL DEFAULT 0;"); } catch { /* column already exists */ }

  // Note: createLogger used here but initLogger() hasn't been called yet,
  // so this falls back to console.log. That's fine for migration output.
  console.log("[db] info: Database migrations complete");
}
