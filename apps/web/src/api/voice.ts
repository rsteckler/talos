import { request } from "./client";
import type {
  VoiceProvider,
  VoiceProviderCreateRequest,
  VoiceProviderUpdateRequest,
  VoiceRoleAssignment,
  VoiceSettings,
  VoiceModelCatalog,
  TranscriptionResult,
} from "@talos/shared/types";

export const voiceApi = {
  // --- Providers ---

  listProviders: () => request<VoiceProvider[]>("/voice/providers"),

  createProvider: (data: VoiceProviderCreateRequest) =>
    request<VoiceProvider>("/voice/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProvider: (id: string, data: VoiceProviderUpdateRequest) =>
    request<VoiceProvider>(`/voice/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  removeProvider: (id: string) =>
    request<{ success: boolean }>(`/voice/providers/${id}`, {
      method: "DELETE",
    }),

  getModels: (providerId: string) =>
    request<VoiceModelCatalog>(`/voice/providers/${providerId}/models`),

  // --- Roles ---

  listRoles: () => request<VoiceRoleAssignment[]>("/voice/roles"),

  setRole: (role: string, voiceProviderId: string, modelId: string, voice?: string | null) =>
    request<VoiceRoleAssignment>(`/voice/roles/${role}`, {
      method: "PUT",
      body: JSON.stringify({ voiceProviderId, modelId, voice }),
    }),

  removeRole: (role: string) =>
    request<{ success: boolean }>(`/voice/roles/${role}`, {
      method: "DELETE",
    }),

  // --- Settings ---

  getSettings: () => request<VoiceSettings>("/voice/settings"),

  updateSettings: (data: Partial<VoiceSettings>) =>
    request<VoiceSettings>("/voice/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // --- Operations ---

  transcribe: async (audioBlob: Blob): Promise<TranscriptionResult> => {
    const formData = new FormData();
    formData.append("audio", audioBlob);
    const res = await fetch("/api/voice/transcribe", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Transcription failed" }));
      throw new Error(err.error ?? "Transcription failed");
    }
    const json = await res.json();
    return json.data;
  },

  synthesize: async (text: string, voice?: string): Promise<Blob> => {
    const res = await fetch("/api/voice/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Synthesis failed" }));
      throw new Error(err.error ?? "Synthesis failed");
    }
    return res.blob();
  },

  synthesizeMessage: async (messageId: string): Promise<Blob> => {
    const res = await fetch(`/api/voice/synthesize/${messageId}`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Synthesis failed" }));
      throw new Error(err.error ?? "Synthesis failed");
    }
    return res.blob();
  },
};
