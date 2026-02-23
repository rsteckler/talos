import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedPlugins } from "./loader.js";
import { DIRECT_PLUGIN_IDS, lookupFunction, getModuleCatalog, getModuleFunctions, formatModuleCatalog } from "./registry.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import { generatePlan } from "../agent/planner.js";
import { executePlan } from "../agent/executor.js";
import type { ToolSet } from "ai";

const log = createLogger("plugins");

/** Default timeout for tool execution (ms). Prevents hanging promises from blocking the pipeline. */
const TOOL_TIMEOUT_MS = 120_000;

/** Race a promise against a timeout. Returns the result or throws on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool "${label}" timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Convert a JSON Schema property definition to a Zod schema.
 * Handles the basic types needed by plugin manifests.
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
 * Resolve a module ref (e.g. "amazon-shopping:search") to its plugin's prompt.md content.
 */
export function getModulePrompt(moduleRef: string): string | null {
  const pluginId = moduleRef.split(":")[0];
  if (!pluginId) return null;
  const loaded = getLoadedPlugins().get(pluginId);
  return loaded?.promptMd ?? null;
}

/**
 * Build an AI SDK ToolSet from all enabled, loaded plugins.
 * Returns the toolset and any prompt.md content to append to the system prompt.
 * If filterPluginIds is provided, only include those specific plugin IDs.
 * If approvalGate is provided, tools without allowWithoutAsking will await approval.
 */
export function buildPluginToolSet(filterPluginIds?: string[], approvalGate?: ApprovalGate): { tools: ToolSet; pluginPrompts: string[] } {
  const loadedPlugins = getLoadedPlugins();
  const tools: ToolSet = {};
  const pluginPrompts: string[] = [];

  for (const [pluginId, loaded] of loadedPlugins) {
    // If a filter is specified, skip plugins not in the list
    if (filterPluginIds && !filterPluginIds.includes(pluginId)) continue;

    // Check if plugin is enabled in DB
    const configRow = db
      .select()
      .from(schema.pluginConfigs)
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
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
      log.dev.debug(`Skipping ${pluginId}: missing credentials: ${missingCreds.map((c) => c.name).join(", ")}`);
      continue;
    }

    // Check OAuth connection if required
    if (loaded.manifest.oauth && !storedConfig["refresh_token"]) {
      log.dev.debug(`Skipping ${pluginId}: OAuth not connected`);
      continue;
    }

    // Add prompt.md content
    if (loaded.promptMd) {
      pluginPrompts.push(loaded.promptMd);
    }

    // Convert each function to an AI SDK tool
    for (const fnSpec of loaded.manifest.functions) {
      const toolName = `${pluginId}_${fnSpec.name}`;
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
            const result = await withTimeout(handler(args, storedConfig), TOOL_TIMEOUT_MS, toolName);
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

  return { tools, pluginPrompts };
}

/**
 * Build a tool set containing only the functions for a specific module.
 * Used by the executor to give each step a focused set of tools.
 */
export function buildModulePluginToolSet(
  moduleRef: string,
  approvalGate?: ApprovalGate,
): { tools: ToolSet; pluginPrompts: string[] } | null {
  const functionNames = getModuleFunctions(moduleRef);
  if (!functionNames || functionNames.length === 0) return null;

  const loadedPlugins = getLoadedPlugins();
  const tools: ToolSet = {};
  const pluginPrompts: string[] = [];
  const addedPrompts = new Set<string>();

  for (const fullName of functionNames) {
    const lookup = lookupFunction(fullName);
    if (!lookup) continue;

    const pluginId = fullName.substring(0, fullName.indexOf("_"));
    const fnName = fullName.substring(fullName.indexOf("_") + 1);
    const fnSpec = lookup.manifest.functions.find((f) => f.name === fnName);
    if (!fnSpec) continue;

    // Add prompt.md once per plugin
    const loaded = loadedPlugins.get(pluginId);
    if (loaded?.promptMd && !addedPrompts.has(pluginId)) {
      pluginPrompts.push(loaded.promptMd);
      addedPrompts.add(pluginId);
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
          const result = await withTimeout(lookup.handler(args, lookup.credentials), TOOL_TIMEOUT_MS, fullName);
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
  return { tools, pluginPrompts };
}

export interface PlanActionCallbacks {
  onPlanStart?: (request: string, steps: Array<{ id: string; description: string }>) => void;
  onPlanStep?: (stepId: string, description: string, status: "running" | "complete" | "error") => void;
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>, stepId?: string) => void;
  onToolResult?: (toolCallId: string, toolName: string, result: unknown, stepId?: string) => void;
}

/**
 * Build a routed tool set for chat: direct plugins + plan_actions meta-tool.
 * Keeps LLM context small (~18 schemas) while supporting unlimited tools
 * via the plan-then-execute pipeline.
 */
export function buildRoutedPluginToolSet(
  approvalGate?: ApprovalGate,
  planCallbacks?: PlanActionCallbacks,
): { tools: ToolSet; pluginPrompts: string[] } {
  // Build direct plugins only
  const { tools, pluginPrompts } = buildPluginToolSet(DIRECT_PLUGIN_IDS, approvalGate);

  // Build module catalog for the plan_actions description and system prompt
  const catalog = getModuleCatalog();
  const catalogText = formatModuleCatalog(catalog);

  if (catalogText) {
    pluginPrompts.unshift(
      loadPrompt("extended-tools.md") + "\n\nAvailable modules:\n" + catalogText,
    );
  }

  // Only add plan_actions if there are extended tools available
  if (catalog.length > 0) {
    tools["plan_actions"] = {
      description: loadPrompt("plan-actions-description.md") + "\n\nAvailable modules:\n" + catalogText,
      inputSchema: z.object({
        request: z.string().describe(loadPrompt("plan-actions-request.md")),
      }),
      execute: async (args: Record<string, unknown>, { abortSignal }: { toolCallId: string; abortSignal?: AbortSignal }) => {
        const request = args["request"] as string;

        log.user.high("Planning actions", { request: request.slice(0, 100) });
        log.dev.debug("plan_actions called", { request });

        try {
          // Collect unique plugin prompts for the planner's context
          const plannerPrompts: string[] = [];
          const seenPlugins = new Set<string>();
          for (const entry of catalog) {
            const pluginId = entry.moduleRef.split(":")[0];
            if (pluginId && !seenPlugins.has(pluginId) && entry.promptMd) {
              seenPlugins.add(pluginId);
              plannerPrompts.push(entry.promptMd);
            }
          }

          const plan = await generatePlan(request, catalogText, plannerPrompts.length > 0 ? plannerPrompts : undefined);
          log.user.high(`Plan created: ${plan.length} step(s)`, { steps: plan.map((s) => s.description) });
          log.dev.debug("Plan details", { plan });

          // Notify client of plan structure before execution
          planCallbacks?.onPlanStart?.(request, plan.map((s) => ({ id: s.id, description: s.description })));

          const result = await executePlan(
            plan,
            request,
            approvalGate,
            (stepId, description, status) => {
              planCallbacks?.onPlanStep?.(stepId, description, status);
            },
            (toolCallId, toolName, toolArgs, stepId) => {
              planCallbacks?.onToolCall?.(toolCallId, toolName, toolArgs, stepId);
            },
            (toolCallId, toolName, toolResult, stepId) => {
              planCallbacks?.onToolResult?.(toolCallId, toolName, toolResult, stepId);
            },
            abortSignal,
          );

          if (result.pluginPrompts && result.pluginPrompts.length > 0) {
            return {
              formattingInstructions:
                "IMPORTANT: When presenting the results below to the user, follow these formatting rules:\n\n"
                + result.pluginPrompts.join("\n\n---\n\n"),
              results: result,
            };
          }
          return result;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error("plan_actions failed", { error: message });
          return { error: message };
        }
      },
    };
  }

  return { tools, pluginPrompts };
}
