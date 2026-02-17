/**
 * Shared types for Talos apps.
 */

export type AgentStatus = "idle" | "thinking" | "tool_calling" | "responding";

export interface HealthResponse {
  status: "ok";
  service: string;
}

// --- Tasks ---

export type TriggerType = "cron" | "interval" | "webhook" | "manual" | (string & {});

export interface Task {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: string; // JSON: { cron?: string, interval_minutes?: number }
  action_prompt: string;
  tools: string | null; // JSON array of plugin IDs, null = all enabled
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface TaskRun {
  id: string;
  task_id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  result: string | null;
  error: string | null;
  usage?: TokenUsage;
}

export interface TaskCreateRequest {
  name: string;
  description?: string;
  trigger_type: TriggerType;
  trigger_config: string;
  action_prompt: string;
  tools?: string[];
  is_active?: boolean;
}

export type TaskUpdateRequest = Partial<TaskCreateRequest>;

// --- Inbox ---

export interface InboxItem {
  id: string;
  task_run_id?: string | null;
  title: string;
  summary?: string | null;
  content: string;
  type: "task_result" | "schedule_result" | "notification";
  is_read: boolean;
  is_pinned: boolean;
  created_at: string;
}

// --- Token Usage ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number; // USD — only set for OpenRouter
}

// --- Chat ---

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  toolCalls?: ToolCallInfo[];
  usage?: TokenUsage;
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary extends Conversation {
  snippet?: string;
}

// --- Providers & Models ---

export type ProviderType = "openai" | "anthropic" | "google" | "openrouter";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProviderCreateRequest {
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
}

export interface ProviderUpdateRequest {
  name?: string;
  apiKey?: string;
  baseUrl?: string | null;
}

export interface CatalogModel {
  modelId: string;
  displayName: string;
}

export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ActiveModel {
  model: Model | null;
  provider: Provider | null;
}

// --- API Response ---

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

// --- Logging ---

export type LogAxis = "user" | "dev";
export type UserLogLevel = "silent" | "low" | "medium" | "high";
export type DevLogLevel = "silent" | "debug" | "verbose";

export interface LogEntry {
  id: string;
  timestamp: string;
  axis: LogAxis;
  level: string;
  area: string;
  message: string;
  data?: unknown;
}

export interface LogConfig {
  area: string;
  userLevel: UserLogLevel;
  devLevel: DevLogLevel;
}

export interface LogSettings {
  pruneDays: number;
}

// --- Connection ---

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

// --- Plugins ---

export interface TriggerParamSource {
  function: string;
  args?: Record<string, unknown>;
  valuePath: string;
  labelPath: string;
  groupPath?: string;
}

export interface TriggerParamSpec {
  key: string;
  label: string;
  type: "multi-select" | "number" | "text";
  description?: string;
  default?: unknown;
  source?: TriggerParamSource; // required for multi-select
}

export interface PluginTriggerSpec {
  id: string;
  label: string;
  description?: string;
  params?: TriggerParamSpec[];
}

export interface PluginSettingSpec {
  name: string;
  label: string;
  type: "number" | "string" | "boolean" | "select";
  default: string;
  description?: string;
  options?: string[]; // required when type is "select"
}

export interface TriggerTypeInfo {
  id: string;
  label: string;
  category: "builtin" | "plugin";
  pluginId?: string;
  description?: string;
  params?: TriggerParamSpec[];
}

export interface TriggerEvent {
  triggerId: string;
  pluginId: string;
  data?: unknown;
  summary?: string;
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface PluginTriggerHandler {
  poll?(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
    settings: Record<string, string>,
  ): Promise<{ event: TriggerEvent | null; newState: Record<string, unknown> }>;

  subscribe?(
    credentials: Record<string, string>,
    settings: Record<string, string>,
    emit: (event: TriggerEvent) => void,
  ): Promise<() => void>; // returns unsubscribe function

  filter?(
    event: TriggerEvent,
    taskConfig: Record<string, unknown>,
  ): boolean;
}

export interface PluginCredentialSpec {
  name: string;
  label: string;
  description?: string;
  required: boolean;
  secret?: boolean; // defaults to true — set false for non-sensitive values like URLs
}

export interface PluginFunctionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface PluginOAuthSpec {
  provider: string;
  scopes: string[];
  authorizeUrl: string;
}

export interface PluginModuleSpec {
  id: string;           // e.g. "gmail", "calendar"
  name: string;         // e.g. "Gmail", "Google Calendar"
  description: string;  // e.g. "Search, read, send, reply, archive emails"
  functions: string[];  // function names from this module
}

export interface PlanStep {
  id: string;              // "step_1", "step_2", etc.
  type: "tool" | "think";
  module?: string;         // "{toolId}:{moduleId}" for tool steps
  description: string;     // what this step accomplishes
  depends_on?: string[];   // step IDs this depends on
}

export interface PlanResult {
  steps: Array<{
    id: string;
    status: "complete" | "error";
    result?: unknown;
    error?: string;
  }>;
  summary: string;
  pluginPrompts?: string[];
}

export interface PluginSidecarSpec {
  /** Path to Dockerfile relative to plugin directory */
  dockerfile: string;
  /** Port the sidecar exposes (mapped 1:1 to host) */
  port: number;
  /** Env vars for the container. Supports {{credentials.key_name}} interpolation */
  env?: Record<string, string>;
  /** Communication protocol */
  transport: "mcp-http" | "mcp-sse" | "http";
  /** Health check endpoint relative to http://localhost:{port} */
  healthCheck?: string;
  /** Seconds to wait for healthy (default: 60) */
  healthTimeout?: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  logName?: string;
  category?: string; // e.g. "core", "productivity", "smart-home", "search", "system"
  defaultEnabled?: boolean;
  credentials?: PluginCredentialSpec[];
  oauth?: PluginOAuthSpec;
  settings?: PluginSettingSpec[];
  triggers?: PluginTriggerSpec[];
  modules?: PluginModuleSpec[];  // optional grouping — if absent, all functions form one implicit module
  sidecar?: PluginSidecarSpec;
  functions: PluginFunctionSpec[];
}

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
  allowWithoutAsking: boolean;
  credentials: PluginCredentialSpec[];
  oauth?: PluginOAuthSpec;
  oauthConnected?: boolean;
  settings: PluginSettingSpec[];
  settingValues?: Record<string, string>;
  /** Non-secret credential values + "__SET__" sentinel for secret ones that have a value */
  credentialValues?: Record<string, string>;
  triggers: PluginTriggerSpec[];
  functions: PluginFunctionSpec[];
  hasRequiredCredentials: boolean;
}

export interface PluginConfig {
  pluginId: string;
  config: Record<string, string>;
  isEnabled: boolean;
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending_approval" | "calling" | "complete" | "error" | "denied";
}

// --- Channels ---

export interface ChannelCredentialSpec {
  name: string;
  label: string;
  description?: string;
  required: boolean;
}

export interface ChannelSettingSpec {
  name: string;
  label: string;
  type: "number" | "string" | "boolean";
  default: string;
  description?: string;
}

export interface ChannelManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  logName?: string;
  credentials: ChannelCredentialSpec[];
  settings?: ChannelSettingSpec[];
}

export interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
  notificationsEnabled: boolean;
  credentials: ChannelCredentialSpec[];
  settings: ChannelSettingSpec[];
  /** "__SET__" sentinel for credentials that have a value */
  credentialValues?: Record<string, string>;
  hasRequiredCredentials: boolean;
}

// --- WebSocket Protocol ---

// --- Themes ---

export interface ThemeMeta {
  id: string;
  name: string;
  author?: string;
  description?: string;
  builtIn: boolean;
}

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
  ring: string;
  "sidebar-background": string;
  "sidebar-foreground": string;
  "sidebar-primary": string;
  "sidebar-primary-foreground": string;
  "sidebar-accent": string;
  "sidebar-accent-foreground": string;
  "sidebar-border": string;
  "sidebar-ring": string;
}

export interface ThemeFile {
  id: string;
  name: string;
  author?: string;
  description?: string;
  light: ThemeColors;
  dark: ThemeColors;
}

// --- WebSocket Protocol ---

export type ClientMessage =
  | { type: "chat"; conversationId: string; content: string }
  | { type: "cancel"; conversationId: string }
  | { type: "tool_approve"; toolCallId: string }
  | { type: "tool_deny"; toolCallId: string }
  | { type: "subscribe_logs" }
  | { type: "unsubscribe_logs" };

export type ServerMessage =
  | { type: "chunk"; conversationId: string; content: string }
  | { type: "end"; conversationId: string; messageId: string; usage?: TokenUsage }
  | { type: "error"; conversationId?: string; error: string }
  | { type: "tool_call"; conversationId: string; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; conversationId: string; toolCallId: string; toolName: string; result: unknown }
  | { type: "tool_approval_request"; conversationId: string; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "status"; status: AgentStatus }
  | { type: "plan_step"; conversationId: string; stepId: string; description: string; status: "running" | "complete" | "error" }
  | { type: "inbox"; item: InboxItem }
  | { type: "log"; entry: LogEntry }
  | { type: "conversation_title_update"; conversationId: string; title: string };
