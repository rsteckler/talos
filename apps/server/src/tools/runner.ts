import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedTools } from "./loader.js";
import { DIRECT_TOOL_IDS, searchRegistry, lookupFunction, getCategories, getToolCatalog } from "./registry.js";
import { createLogger } from "../logger/index.js";
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
 * Build a routed tool set for chat: direct tools + find_tools/use_tool meta-tools.
 * Keeps LLM context small (~18 schemas) while supporting unlimited tools via search.
 */
export function buildRoutedToolSet(approvalGate?: ApprovalGate): { tools: ToolSet; toolPrompts: string[] } {
  // Build direct tools only
  const { tools, toolPrompts } = buildToolSet(DIRECT_TOOL_IDS, approvalGate);

  // Prepend tool catalog so the LLM knows what extended tools are available
  const catalog = getToolCatalog();
  if (catalog) {
    toolPrompts.unshift(catalog);
  }

  // Add find_tools meta-tool
  tools["find_tools"] = {
    description: "Search for available tool functions by keyword. Call this FIRST to discover tools, then pass the returned tool name to use_tool. Never call extended tools directly — they are only accessible through find_tools + use_tool.",
    inputSchema: z.object({
      query: z.string().describe("Natural language search query (e.g. 'turn on lights', 'search the web', 'create a task')"),
      category: z.string().optional().describe("Optional category filter: productivity, smart-home, search, system"),
      limit: z.number().optional().describe("Maximum results to return. Defaults to 10."),
    }),
    execute: async (args: Record<string, unknown>) => {
      const query = args["query"] as string;
      const category = args["category"] as string | undefined;
      const limit = args["limit"] as number | undefined;

      log.dev.debug("find_tools search", { query, category, limit });

      const results = searchRegistry(query, category, limit);
      if (results.length === 0) {
        const categories = getCategories();
        return {
          results: [],
          message: "No matching tools found. Try a different query.",
          available_categories: categories,
        };
      }

      return { results };
    },
  };

  // Add use_tool meta-tool
  tools["use_tool"] = {
    description: "Execute a tool function discovered via find_tools. Pass the exact tool name and its required arguments.",
    inputSchema: z.object({
      tool_name: z.string().describe("Exact tool name from find_tools results (e.g. 'home-assistant_turn_on')"),
      args: z.record(z.unknown()).optional().describe("Arguments for the tool function").default({}),
    }),
    execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
      const toolName = args["tool_name"] as string;
      const toolArgs = (args["args"] ?? {}) as Record<string, unknown>;

      const lookup = lookupFunction(toolName);
      if (!lookup) {
        log.warn(`use_tool: unknown tool "${toolName}"`);
        return { error: `Tool "${toolName}" not found. Use find_tools to discover available tools.` };
      }

      // Gate on approval if not auto-allowed
      if (!lookup.autoAllow && approvalGate) {
        const approved = await approvalGate(toolCallId, toolName, toolArgs);
        if (!approved) {
          log.user.medium("Tool denied", { tool: toolName });
          return { denied: true, message: "User denied tool execution" };
        }
      }

      log.dev.debug(`use_tool executing ${toolName}`, { args: toolArgs });
      try {
        const result = await lookup.handler(toolArgs, lookup.credentials);
        log.dev.debug(`use_tool completed ${toolName}`, { resultPreview: JSON.stringify(result).slice(0, 100) });
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`use_tool ${toolName} threw`, { error: message });
        return { error: message };
      }
    },
  };

  return { tools, toolPrompts };
}
