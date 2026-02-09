import type { ToolManifest } from "@talos/shared/types";

export type ToolHandler = (args: Record<string, unknown>, credentials?: Record<string, string>) => Promise<unknown>;

export interface LoadedTool {
  manifest: ToolManifest;
  handlers: Record<string, ToolHandler>;
  promptMd?: string;
}
