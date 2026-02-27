import { createOpenAI } from "@ai-sdk/openai";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { VoiceRole, VoiceSettings } from "@talos/shared/types";

type VoiceProviderRow = typeof schema.voiceProviders.$inferSelect;

export function createVoiceProvider(row: VoiceProviderRow) {
  switch (row.type) {
    case "openai":
      return createOpenAI({
        apiKey: row.apiKey,
        ...(row.baseUrl ? { baseURL: row.baseUrl } : {}),
      });
    case "elevenlabs":
      return createElevenLabs({
        apiKey: row.apiKey,
      });
    default:
      throw new Error(`Unknown voice provider type: ${row.type}`);
  }
}

export function getVoiceProviderForRole(role: VoiceRole) {
  const assignment = db
    .select()
    .from(schema.voiceRoles)
    .where(eq(schema.voiceRoles.role, role))
    .get();

  if (!assignment) return null;

  const providerRow = db
    .select()
    .from(schema.voiceProviders)
    .where(eq(schema.voiceProviders.id, assignment.voiceProviderId))
    .get();

  if (!providerRow) return null;

  const provider = createVoiceProvider(providerRow);
  return {
    provider,
    providerRow,
    modelId: assignment.modelId,
    voice: assignment.voice,
  };
}

export function getVoiceSettings(): VoiceSettings {
  const row = db
    .select()
    .from(schema.voiceSettings)
    .where(eq(schema.voiceSettings.id, 1))
    .get();

  if (!row) {
    return {
      defaultVoice: "alloy",
      language: "en",
      outputFormat: "mp3",
      speed: "1.0",
      autoTtsEnabled: false,
    };
  }

  return {
    defaultVoice: row.defaultVoice,
    language: row.language,
    outputFormat: row.outputFormat,
    speed: row.speed,
    autoTtsEnabled: row.autoTtsEnabled,
  };
}
