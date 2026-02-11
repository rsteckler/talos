import type { ToolTriggerHandler, ToolTriggerSpec, TriggerTypeInfo } from "@talos/shared/types";

export interface RegisteredTrigger {
  toolId: string;
  localId: string;
  fullId: string;
  spec: ToolTriggerSpec;
  handler: ToolTriggerHandler;
}

const triggers = new Map<string, RegisteredTrigger>();

const BUILTIN_TYPES: TriggerTypeInfo[] = [
  { id: "cron", label: "Cron Schedule", category: "builtin" },
  { id: "interval", label: "Interval", category: "builtin" },
  { id: "webhook", label: "Webhook", category: "builtin" },
  { id: "manual", label: "Manual", category: "builtin" },
];

export function registerTrigger(
  toolId: string,
  localId: string,
  spec: ToolTriggerSpec,
  handler: ToolTriggerHandler,
): void {
  const fullId = `${toolId}:${localId}`;
  triggers.set(fullId, { toolId, localId, fullId, spec, handler });
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
      category: "tool",
      toolId: reg.toolId,
      description: reg.spec.description,
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
