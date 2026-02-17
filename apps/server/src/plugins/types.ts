import type { PluginManifest, PluginTriggerHandler, PluginLogger } from "@talos/shared/types";

export type PluginHandler = (args: Record<string, unknown>, credentials?: Record<string, string>) => Promise<unknown>;

export interface LoadedPlugin {
  manifest: PluginManifest;
  handlers: Record<string, PluginHandler>;
  triggers?: Record<string, PluginTriggerHandler>;
  promptMd?: string;
  pluginDir: string;
  start?: (credentials: Record<string, string>, logger: PluginLogger) => Promise<void>;
  stop?: () => Promise<void>;
}
