import { experimental_generateSpeech as generateSpeech, experimental_transcribe as transcribe } from "ai";
import { getVoiceProviderForRole, getVoiceSettings } from "../providers/voice.js";

export async function transcribeAudio(
  audioBuffer: Buffer,
  _mimeType: string,
): Promise<{ text: string; durationSeconds?: number }> {
  const voiceConfig = getVoiceProviderForRole("stt");
  if (!voiceConfig) {
    throw new Error("No STT provider configured. Add a voice provider and assign the STT role in Settings → Voice.");
  }

  const model = voiceConfig.provider.transcription(voiceConfig.modelId);

  const result = await transcribe({
    model,
    audio: audioBuffer,
  });

  return {
    text: result.text,
    durationSeconds: result.durationInSeconds,
  };
}

export async function synthesizeSpeech(
  text: string,
  options?: { voice?: string },
): Promise<{ audio: Uint8Array; mediaType: string }> {
  const voiceConfig = getVoiceProviderForRole("tts");
  if (!voiceConfig) {
    throw new Error("No TTS provider configured. Add a voice provider and assign the TTS role in Settings → Voice.");
  }

  const settings = getVoiceSettings();

  const model = voiceConfig.provider.speech(voiceConfig.modelId);

  const result = await generateSpeech({
    model,
    text,
    voice: options?.voice ?? voiceConfig.voice ?? settings.defaultVoice,
  });

  return {
    audio: result.audio.uint8Array,
    mediaType: result.audio.mediaType,
  };
}
