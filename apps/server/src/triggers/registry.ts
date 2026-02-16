import type { PluginTriggerHandler, PluginTriggerSpec, TriggerTypeInfo } from "@talos/shared/types";

export interface RegisteredTrigger {
  pluginId: string;
  localId: string;
  fullId: string;
  spec: PluginTriggerSpec;
  handler: PluginTriggerHandler;
}

const triggers = new Map<string, RegisteredTrigger>();

const BUILTIN_TYPES: TriggerTypeInfo[] = [
  { id: "cron", label: "Cron Schedule", category: "builtin" },
  { id: "interval", label: "Interval", category: "builtin" },
  { id: "webhook", label: "Webhook", category: "builtin" },
  { id: "manual", label: "Manual", category: "builtin" },
];

export function registerTrigger(
  pluginId: string,
  localId: string,
  spec: PluginTriggerSpec,
  handler: PluginTriggerHandler,
): void {
  const fullId = `${pluginId}:${localId}`;
  triggers.set(fullId, { pluginId, localId, fullId, spec, handler });
}

export function getTrigger(fullId: string): RegisteredTrigger | undefined {
  return triggers.get(fullId);
}

export function getAllTriggerTypes(): TriggerTypeInfo[] {
  const toolTypes: TriggerTypeInfo[] = [];
  for (const reg of triggers.values()) {
    toolTypes.push({
      id: reg.fullId,
      label: reg.spec.label,
      category: "plugin",
      pluginId: reg.pluginId,
      description: reg.spec.description,
      params: reg.spec.params,
    });
  }
  return [...BUILTIN_TYPES, ...toolTypes];
}

export function isRegisteredTrigger(triggerType: string): boolean {
  return triggers.has(triggerType);
}

export function clearRegistry(): void {
  triggers.clear();
}
