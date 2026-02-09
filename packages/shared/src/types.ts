/**
 * Shared types for Talos apps.
 */

export type AgentStatus = "idle" | "thinking" | "tool_calling" | "responding";

export interface HealthResponse {
  status: "ok";
  service: string;
}

// --- Inbox ---

export interface InboxItem {
  id: string;
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
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// --- Providers & Models ---

export type ProviderType = "openai" | "anthropic" | "google";

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

// --- Connection ---

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

// --- WebSocket Protocol ---

export type ClientMessage =
  | { type: "chat"; conversationId: string; content: string }
  | { type: "cancel"; conversationId: string };

export type ServerMessage =
  | { type: "chunk"; conversationId: string; content: string }
  | { type: "end"; conversationId: string; messageId: string }
  | { type: "tool_call"; conversationId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; conversationId: string; toolName: string; result: unknown }
  | { type: "status"; status: AgentStatus }
  | { type: "inbox"; item: InboxItem };
