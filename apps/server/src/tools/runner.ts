import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedTools } from "./loader.js";
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

/**
 * Build an AI SDK ToolSet from all enabled, loaded tools.
 * Returns the toolset and any prompt.md content to append to the system prompt.
 */
export function buildToolSet(): { tools: ToolSet; toolPrompts: string[] } {
  const loadedTools = getLoadedTools();
  const tools: ToolSet = {};
  const toolPrompts: string[] = [];

  for (const [toolId, loaded] of loadedTools) {
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

      tools[toolName] = {
        description: fnSpec.description,
        inputSchema,
        execute: async (args: Record<string, unknown>) => {
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
