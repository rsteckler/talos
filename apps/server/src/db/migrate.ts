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

  console.log("Database migrations complete");
}
