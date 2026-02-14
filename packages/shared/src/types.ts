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
  tools: string | null; // JSON array of tool IDs, null = all enabled
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

// --- Tools ---

export interface ToolTriggerSpec {
  id: string;
  label: string;
  description?: string;
}

export interface ToolSettingSpec {
  name: string;
  label: string;
  type: "number" | "string" | "boolean";
  default: string;
  description?: string;
}

export interface TriggerTypeInfo {
  id: string;
  label: string;
  category: "builtin" | "tool";
  toolId?: string;
  description?: string;
}

export interface TriggerEvent {
  triggerId: string;
  toolId: string;
  data?: unknown;
  summary?: string;
}

export interface ToolLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface ToolTriggerHandler {
  poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
    settings: Record<string, string>,
  ): Promise<{ event: TriggerEvent | null; newState: Record<string, unknown> }>;
}

export interface ToolCredentialSpec {
  name: string;
  label: string;
  description?: string;
  required: boolean;
}

export interface ToolFunctionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolOAuthSpec {
  provider: string;
  scopes: string[];
  authorizeUrl: string;
}

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  logName?: string;
  defaultEnabled?: boolean;
  credentials?: ToolCredentialSpec[];
  oauth?: ToolOAuthSpec;
  settings?: ToolSettingSpec[];
  triggers?: ToolTriggerSpec[];
  functions: ToolFunctionSpec[];
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
  allowWithoutAsking: boolean;
  credentials: ToolCredentialSpec[];
  oauth?: ToolOAuthSpec;
  oauthConnected?: boolean;
  settings: ToolSettingSpec[];
  settingValues?: Record<string, string>;
  triggers: ToolTriggerSpec[];
  functions: ToolFunctionSpec[];
  hasRequiredCredentials: boolean;
}

export interface ToolConfig {
  toolId: string;
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
  | { type: "inbox"; item: InboxItem }
  | { type: "log"; entry: LogEntry }
  | { type: "conversation_title_update"; conversationId: string; title: string };
