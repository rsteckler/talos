import type { PluginManifest, PluginTriggerHandler } from "@talos/shared/types";

export type PluginHandler = (args: Record<string, unknown>, credentials?: Record<string, string>) => Promise<unknown>;

export interface LoadedPlugin {
  manifest: PluginManifest;
  handlers: Record<string, PluginHandler>;
  triggers?: Record<string, PluginTriggerHandler>;
  promptMd?: string;
}
