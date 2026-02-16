import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedTools } from "./loader.js";
import { DIRECT_TOOL_IDS, lookupFunction, getModuleCatalog, getModuleFunctions, formatModuleCatalog } from "./registry.js";
import { createLogger } from "../logger/index.js";
import { generatePlan } from "../agent/planner.js";
import { executePlan } from "../agent/executor.js";
import type { ToolSet } from "ai";

const log = createLogger("tools");

/**
 * Convert a JSON Schema property definition to a Zod schema.
 * Handles the basic types needed by tool manifests.
 */
function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  switch (prop["type"]) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = prop["items"] as Record<string, unknown> | undefined;
      return z.array(items ? jsonSchemaPropertyToZod(items) : z.unknown());
    }
    default:
      return z.unknown();
  }
}

/**
 * Convert a JSON Schema "object" definition to a Zod object schema.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const properties = (schema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema["required"] ?? []) as string[];

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const zodProp = jsonSchemaPropertyToZod(prop);
    const desc = typeof prop["description"] === "string" ? prop["description"] : undefined;
    const described = desc ? zodProp.describe(desc) : zodProp;
    shape[key] = required.includes(key) ? described : described.optional();
  }

  return z.object(shape);
}

export type ApprovalGate = (toolCallId: string, toolName: string, args: Record<string, unknown>) => Promise<boolean>;

/**
 * Build an AI SDK ToolSet from all enabled, loaded tools.
 * Returns the toolset and any prompt.md content to append to the system prompt.
 * If filterToolIds is provided, only include those specific tool IDs.
 * If approvalGate is provided, tools without allowWithoutAsking will await approval.
 */
export function buildToolSet(filterToolIds?: string[], approvalGate?: ApprovalGate): { tools: ToolSet; toolPrompts: string[] } {
  const loadedTools = getLoadedTools();
  const tools: ToolSet = {};
  const toolPrompts: string[] = [];

  for (const [toolId, loaded] of loadedTools) {
    // If a filter is specified, skip tools not in the list
    if (filterToolIds && !filterToolIds.includes(toolId)) continue;

    // Check if tool is enabled in DB
    const configRow = db
      .select()
      .from(schema.toolConfigs)
      .where(eq(schema.toolConfigs.toolId, toolId))
      .get();

    if (!configRow?.isEnabled) continue;

    // Parse stored credentials
    const storedConfig: Record<string, string> = configRow.config
      ? (JSON.parse(configRow.config) as Record<string, string>)
      : {};

    // Check required credentials
    const requiredCreds = loaded.manifest.credentials?.filter((c) => c.required) ?? [];
    const missingCreds = requiredCreds.filter((c) => !storedConfig[c.name]);
    if (missingCreds.length > 0) {
      log.dev.debug(`Skipping ${toolId}: missing credentials: ${missingCreds.map((c) => c.name).join(", ")}`);
      continue;
    }

    // Check OAuth connection if required
    if (loaded.manifest.oauth && !storedConfig["refresh_token"]) {
      log.dev.debug(`Skipping ${toolId}: OAuth not connected`);
      continue;
    }

    // Add prompt.md content
    if (loaded.promptMd) {
      toolPrompts.push(loaded.promptMd);
    }

    // Convert each function to an AI SDK tool
    for (const fnSpec of loaded.manifest.functions) {
      const toolName = `${toolId}_${fnSpec.name}`;
      const handler = loaded.handlers[fnSpec.name];

      if (!handler) {
        log.warn(`No handler for ${toolName}`);
        continue;
      }

      const inputSchema = jsonSchemaToZod(fnSpec.parameters);
      const autoAllow = configRow.allowWithoutAsking;

      tools[toolName] = {
        description: fnSpec.description,
        inputSchema,
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          // Gate on approval if not auto-allowed
          if (!autoAllow && approvalGate) {
            const approved = await approvalGate(toolCallId, toolName, args);
            if (!approved) {
              log.user.medium("Tool denied", { tool: toolName });
              return { denied: true, message: "User denied tool execution" };
            }
          }

          log.dev.debug(`Executing ${toolName}`, { args });
          try {
            const result = await handler(args, storedConfig);
            log.dev.debug(`Completed ${toolName}`, { resultPreview: JSON.stringify(result).slice(0, 100) });
            return result;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Tool ${toolName} threw`, { error: message });
            return { error: message };
          }
        },
      };
    }
  }

  return { tools, toolPrompts };
}

/**
 * Build a tool set containing only the functions for a specific module.
 * Used by the executor to give each step a focused set of tools.
 */
export function buildModuleToolSet(
  moduleRef: string,
  approvalGate?: ApprovalGate,
): { tools: ToolSet; toolPrompts: string[] } | null {
  const functionNames = getModuleFunctions(moduleRef);
  if (!functionNames || functionNames.length === 0) return null;

  const loadedTools = getLoadedTools();
  const tools: ToolSet = {};
  const toolPrompts: string[] = [];
  const addedPrompts = new Set<string>();

  for (const fullName of functionNames) {
    const lookup = lookupFunction(fullName);
    if (!lookup) continue;

    const toolId = fullName.substring(0, fullName.indexOf("_"));
    const fnName = fullName.substring(fullName.indexOf("_") + 1);
    const fnSpec = lookup.manifest.functions.find((f) => f.name === fnName);
    if (!fnSpec) continue;

    // Add prompt.md once per tool
    const loaded = loadedTools.get(toolId);
    if (loaded?.promptMd && !addedPrompts.has(toolId)) {
      toolPrompts.push(loaded.promptMd);
      addedPrompts.add(toolId);
    }

    const inputSchema = jsonSchemaToZod(fnSpec.parameters);

    tools[fullName] = {
      description: fnSpec.description,
      inputSchema,
      execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
        if (!lookup.autoAllow && approvalGate) {
          const approved = await approvalGate(toolCallId, fullName, args);
          if (!approved) {
            log.user.medium("Tool denied", { tool: fullName });
            return { denied: true, message: "User denied tool execution" };
          }
        }

        log.dev.debug(`Executing ${fullName}`, { args });
        try {
          const result = await lookup.handler(args, lookup.credentials);
          log.dev.debug(`Completed ${fullName}`, { resultPreview: JSON.stringify(result).slice(0, 100) });
          return result;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Tool ${fullName} threw`, { error: message });
          return { error: message };
        }
      },
    };
  }

  if (Object.keys(tools).length === 0) return null;
  return { tools, toolPrompts };
}

export interface PlanActionCallbacks {
  onPlanStep?: (stepId: string, description: string, status: "running" | "complete" | "error") => void;
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void;
}

/**
 * Build a routed tool set for chat: direct tools + plan_actions meta-tool.
 * Keeps LLM context small (~18 schemas) while supporting unlimited tools
 * via the plan-then-execute pipeline.
 */
export function buildRoutedToolSet(
  approvalGate?: ApprovalGate,
  planCallbacks?: PlanActionCallbacks,
): { tools: ToolSet; toolPrompts: string[] } {
  // Build direct tools only
  const { tools, toolPrompts } = buildToolSet(DIRECT_TOOL_IDS, approvalGate);

  // Build module catalog for the plan_actions description and system prompt
  const catalog = getModuleCatalog();
  const catalogText = formatModuleCatalog(catalog);

  if (catalogText) {
    toolPrompts.unshift(
      "## Extended Tools\n\n"
      + "Beyond your direct tools, you can access many more capabilities via `plan_actions`.\n"
      + "Call `plan_actions` whenever the user's request requires capabilities not in your direct tool set.\n\n"
      + "**IMPORTANT**: Always pass the user's COMPLETE request in a single `plan_actions` call. "
      + "Do NOT split a multi-step request into multiple calls — the planner handles multi-step orchestration and data flow between steps internally. "
      + "For example, \"search my notes for X and email the result to Y\" should be ONE plan_actions call with the full request.\n\n"
      + "Available modules:\n" + catalogText,
    );
  }

  // Only add plan_actions if there are extended tools available
  if (catalog.length > 0) {
    tools["plan_actions"] = {
      description: `Execute a multi-step action plan using extended tools. The system will automatically plan and execute all necessary steps, passing data between them.\n\nIMPORTANT: Always pass the user's COMPLETE request in a single call. Do NOT break a multi-step request into separate plan_actions calls — the planner handles multi-step orchestration internally. For example, "search my notes and email the result" should be ONE call, not two.\n\nAvailable modules:\n${catalogText}`,
      inputSchema: z.object({
        request: z.string().describe("The user's COMPLETE request — include the full goal, not just one part of it"),
      }),
      execute: async (args: Record<string, unknown>) => {
        const request = args["request"] as string;

        log.user.high("Planning actions", { request: request.slice(0, 100) });
        log.dev.debug("plan_actions called", { request });

        try {
          const plan = await generatePlan(request, catalogText);
          log.user.high(`Plan created: ${plan.length} step(s)`, { steps: plan.map((s) => s.description) });
          log.dev.debug("Plan details", { plan });

          const result = await executePlan(
            plan,
            request,
            approvalGate,
            (stepId, description, status) => {
              planCallbacks?.onPlanStep?.(stepId, description, status);
            },
            (toolCallId, toolName, toolArgs) => {
              planCallbacks?.onToolCall?.(toolCallId, toolName, toolArgs);
            },
            (toolCallId, toolName, toolResult) => {
              planCallbacks?.onToolResult?.(toolCallId, toolName, toolResult);
            },
          );

          return result;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error("plan_actions failed", { error: message });
          return { error: message };
        }
      },
    };
  }

  return { tools, toolPrompts };
}
