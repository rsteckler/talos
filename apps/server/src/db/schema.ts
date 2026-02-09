import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["openai", "anthropic", "google", "openrouter"] }).notNull(),
  apiKey: text("api_key").notNull(),
  baseUrl: text("base_url"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const toolConfigs = sqliteTable("tool_configs", {
  toolId: text("tool_id").primaryKey(),
  config: text("config").notNull().default("{}"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  axis: text("axis", { enum: ["user", "dev"] }).notNull(),
  level: text("level").notNull(),
  area: text("area").notNull(),
  message: text("message").notNull(),
  data: text("data"),
  createdAt: text("created_at").notNull(),
});

export const logConfigs = sqliteTable("log_configs", {
  area: text("area").primaryKey(),
  userLevel: text("user_level").notNull().default("low"),
  devLevel: text("dev_level").notNull().default("silent"),
  updatedAt: text("updated_at").notNull(),
});

export const logSettings = sqliteTable("log_settings", {
  id: integer("id").primaryKey(),
  pruneDays: integer("prune_days").notNull().default(7),
  updatedAt: text("updated_at").notNull(),
});
