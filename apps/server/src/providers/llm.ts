import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, schema } from "../db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PATH = path.join(__dirname, "..", "agent", "SYSTEM.md");
const SOUL_PATH = path.join(__dirname, "..", "..", "data", "SOUL.md");
const PLUGINS_PATH = path.join(__dirname, "..", "..", "data", "PLUGINS.md");
const HUMAN_PATH = path.join(__dirname, "..", "..", "data", "HUMAN.md");
const ONBOARDING_PATH = path.join(__dirname, "..", "..", "data", "ONBOARDING.md");

const DEFAULT_HUMAN_CONTENT = "# Human\n\nThis document is for tracking information about the human user.";

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
    apiKey: providerRow.apiKey,
  };
}

export function loadSystemPrompt(): string {
  let system = "";
  try {
    system = fs.readFileSync(SYSTEM_PATH, "utf-8");
  } catch {
    // SYSTEM.md missing — continue without it
  }

  let soul: string;
  try {
    soul = fs.readFileSync(SOUL_PATH, "utf-8");
  } catch {
    soul = "You are Talos, a helpful AI assistant.";
  }

  let pluginsInstructions = "";
  try {
    pluginsInstructions = fs.readFileSync(PLUGINS_PATH, "utf-8").trim();
  } catch {
    // PLUGINS.md missing — continue without it
  }

  let humanNotes = "";
  try {
    humanNotes = fs.readFileSync(HUMAN_PATH, "utf-8").trim();
  } catch {
    // HUMAN.md missing — continue without it
  }

  const needsOnboarding =
    !humanNotes || humanNotes === DEFAULT_HUMAN_CONTENT.trim();

  let onboarding = "";
  if (needsOnboarding) {
    try {
      onboarding = fs.readFileSync(ONBOARDING_PATH, "utf-8").trim();
    } catch {
      // ONBOARDING.md missing — skip onboarding gracefully
    }
  }

  let prompt = system ? `${system}\n\n---\n\n${soul}` : soul;
  if (onboarding) {
    prompt += `\n\n---\n\n${onboarding}`;
  }
  if (pluginsInstructions) {
    prompt += `\n\n---\n\n${pluginsInstructions}`;
  }
  if (humanNotes && !needsOnboarding) {
    prompt += `\n\n---\n\n${humanNotes}`;
  }
  return prompt;
}

export function readSoulFile(): string {
  return loadSystemPrompt();
}

export function writeSoulFile(content: string): void {
  fs.writeFileSync(SOUL_PATH, content, "utf-8");
}

export function readPluginsFile(): string {
  try {
    return fs.readFileSync(PLUGINS_PATH, "utf-8");
  } catch {
    return "";
  }
}

export function writePluginsFile(content: string): void {
  fs.writeFileSync(PLUGINS_PATH, content, "utf-8");
}

export function readHumanFile(): string {
  try {
    return fs.readFileSync(HUMAN_PATH, "utf-8");
  } catch {
    return "";
  }
}

export function writeHumanFile(content: string): void {
  fs.writeFileSync(HUMAN_PATH, content, "utf-8");
}
