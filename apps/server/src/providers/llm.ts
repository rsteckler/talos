import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, schema } from "../db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUL_PATH = path.join(__dirname, "..", "..", "data", "SOUL.md");

type ProviderRow = typeof schema.providers.$inferSelect;

/**
 * Fetch middleware for OpenRouter's Responses API.
 * The AI SDK sends assistant history items as `{ role: "assistant", content: [...] }`
 * but OpenRouter requires `{ type: "message", role: "assistant", id: "...", status: "completed", content: [...] }`.
 */
const openRouterResponsesFetch: typeof globalThis.fetch = async (url, init) => {
  if (init?.method === "POST" && String(url).includes("/responses")) {
    try {
      const body = JSON.parse(init.body as string);
      if (Array.isArray(body.input)) {
        body.input = body.input.map((item: Record<string, unknown>, i: number) => {
          if (item["role"] === "assistant" && !item["type"]) {
            return {
              type: "message",
              ...item,
              id: item["id"] ?? `hist_${i}_${Date.now()}`,
              status: "completed",
            };
          }
          return item;
        });
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // pass through on parse failure
    }
  }
  return globalThis.fetch(url, init);
};

export function createLLMProvider(row: ProviderRow) {
  const opts = {
    apiKey: row.apiKey,
    ...(row.baseUrl ? { baseURL: row.baseUrl } : {}),
  };

  switch (row.type) {
    case "openai":
      return createOpenAI(opts);
    case "anthropic":
      return createAnthropic(opts);
    case "google":
      return createGoogleGenerativeAI(opts);
    case "openrouter":
      return createOpenAI({
        apiKey: row.apiKey,
        baseURL: row.baseUrl || "https://openrouter.ai/api/v1",
        fetch: openRouterResponsesFetch,
      });
    default:
      throw new Error(`Unknown provider type: ${row.type}`);
  }
}

export function getActiveProvider() {
  const activeModel = db
    .select()
    .from(schema.models)
    .where(eq(schema.models.isDefault, true))
    .get();

  if (!activeModel) return null;

  const provider = db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, activeModel.providerId))
    .get();

  if (!provider) return null;

  return {
    provider: createLLMProvider(provider),
    modelId: activeModel.modelId,
    providerType: provider.type,
  };
}

export function loadSystemPrompt(): string {
  try {
    return fs.readFileSync(SOUL_PATH, "utf-8");
  } catch {
    return "You are Talos, a helpful AI assistant.";
  }
}

export function readSoulFile(): string {
  return loadSystemPrompt();
}

export function writeSoulFile(content: string): void {
  fs.writeFileSync(SOUL_PATH, content, "utf-8");
}
