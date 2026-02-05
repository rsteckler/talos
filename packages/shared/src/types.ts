/**
 * Shared types for Talos apps.
 */

export type AgentStatus = "idle" | "thinking" | "tool_calling" | "responding";

export interface HealthResponse {
  status: "ok";
  service: string;
}
