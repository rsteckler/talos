/**
 * Shared types for Talos apps.
 */

export type AgentStatus = "idle" | "thinking" | "tool_calling" | "responding";

export interface HealthResponse {
  status: "ok";
  service: string;
}

// --- Tasks ---

export type TriggerType = "cron" | "interval" | "webhook" | "manual";

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
  content: string;
  type: "task_result" | "schedule_result" | "notification";
  is_read: boolean;
  created_at: string;
}

// --- Chat ---

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  toolCalls?: ToolCallInfo[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
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

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  credentials?: ToolCredentialSpec[];
  functions: ToolFunctionSpec[];
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
  credentials: ToolCredentialSpec[];
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
  status: "calling" | "complete" | "error";
}

// --- WebSocket Protocol ---

export type ClientMessage =
  | { type: "chat"; conversationId: string; content: string }
  | { type: "cancel"; conversationId: string }
  | { type: "subscribe_logs" }
  | { type: "unsubscribe_logs" };

export type ServerMessage =
  | { type: "chunk"; conversationId: string; content: string }
  | { type: "end"; conversationId: string; messageId: string }
  | { type: "error"; conversationId?: string; error: string }
  | { type: "tool_call"; conversationId: string; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; conversationId: string; toolCallId: string; toolName: string; result: unknown }
  | { type: "status"; status: AgentStatus }
  | { type: "inbox"; item: InboxItem }
  | { type: "log"; entry: LogEntry };
