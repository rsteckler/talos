import type { ToolManifest, ToolTriggerHandler } from "@talos/shared/types";

export type ToolHandler = (args: Record<string, unknown>, credentials?: Record<string, string>) => Promise<unknown>;

export interface LoadedTool {
  manifest: ToolManifest;
  handlers: Record<string, ToolHandler>;
  triggers?: Record<string, ToolTriggerHandler>;
  promptMd?: string;
}
