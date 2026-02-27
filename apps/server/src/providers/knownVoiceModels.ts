import type { VoiceModelCatalog } from "@talos/shared/types";

export const KNOWN_VOICE_MODELS: Record<string, VoiceModelCatalog> = {
  openai: {
    tts: [
      {
        modelId: "tts-1",
        displayName: "TTS-1",
        voices: ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"],
      },
      {
        modelId: "tts-1-hd",
        displayName: "TTS-1 HD",
        voices: ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"],
      },
      {
        modelId: "gpt-4o-mini-tts",
        displayName: "GPT-4o Mini TTS",
        voices: ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"],
      },
    ],
    stt: [
      { modelId: "whisper-1", displayName: "Whisper-1" },
      { modelId: "gpt-4o-mini-transcribe", displayName: "GPT-4o Mini Transcribe" },
      { modelId: "gpt-4o-transcribe", displayName: "GPT-4o Transcribe" },
    ],
  },
  elevenlabs: {
    tts: [
      { modelId: "eleven_multilingual_v2", displayName: "Multilingual v2" },
      { modelId: "eleven_flash_v2_5", displayName: "Flash v2.5" },
      { modelId: "eleven_turbo_v2_5", displayName: "Turbo v2.5" },
      { modelId: "eleven_v3", displayName: "v3" },
    ],
    stt: [
      { modelId: "scribe_v1", displayName: "Scribe v1" },
    ],
  },
};
