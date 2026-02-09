export interface KnownModel {
  modelId: string;
  displayName: string;
}

export const KNOWN_MODELS: Record<string, KnownModel[]> = {
  openai: [
    { modelId: "gpt-4o", displayName: "GPT-4o" },
    { modelId: "gpt-4o-mini", displayName: "GPT-4o Mini" },
    { modelId: "gpt-4-turbo", displayName: "GPT-4 Turbo" },
    { modelId: "o1", displayName: "o1" },
    { modelId: "o1-mini", displayName: "o1 Mini" },
    { modelId: "o3-mini", displayName: "o3 Mini" },
  ],
  anthropic: [
    { modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4" },
    { modelId: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet" },
    { modelId: "claude-3-5-haiku-20241022", displayName: "Claude 3.5 Haiku" },
    { modelId: "claude-3-opus-20240229", displayName: "Claude 3 Opus" },
  ],
  google: [
    { modelId: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
    { modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
    { modelId: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash" },
  ],
};
