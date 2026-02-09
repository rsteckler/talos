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

  const providerRow = db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, activeModel.providerId))
    .get();

  if (!providerRow) return null;

  const llmProvider = createLLMProvider(providerRow);

  // OpenRouter requires the Chat Completions API for tool calling.
  // The default provider(modelId) call uses the Responses API, which
  // doesn't reliably forward tool definitions to models on OpenRouter.
  const model = providerRow.type === "openrouter"
    ? (llmProvider as ReturnType<typeof createOpenAI>).chat(activeModel.modelId)
    : llmProvider(activeModel.modelId);

  return {
    model,
    modelId: activeModel.modelId,
    providerType: providerRow.type,
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
