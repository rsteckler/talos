import { create } from "zustand"
import type { Provider, Model, ActiveModel, ProviderUpdateRequest } from "@talos/shared/types"
import { providersApi } from "@/api"

interface ProviderState {
  providers: Provider[];
  modelsByProvider: Record<string, Model[]>;
  activeModel: ActiveModel;
  isLoading: boolean;
  error: string | null;

  fetchProviders: () => Promise<void>;
  addProvider: (data: { name: string; type: "openai" | "anthropic" | "google" | "openrouter"; apiKey: string; baseUrl?: string }) => Promise<void>;
  updateProvider: (id: string, data: ProviderUpdateRequest) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  fetchModels: (providerId: string) => Promise<void>;
  refreshModels: (providerId: string) => Promise<void>;
  fetchActiveModel: () => Promise<void>;
  setActiveModel: (modelId: string) => Promise<void>;
  setActiveModelFromCatalog: (providerId: string, catalogModelId: string, displayName: string) => Promise<void>;
  clearError: () => void;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  modelsByProvider: {},
  activeModel: { model: null, provider: null },
  isLoading: false,
  error: null,

  fetchProviders: async () => {
    set({ isLoading: true, error: null });
    try {
      const providers = await providersApi.list();
      set({ providers });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to fetch providers" });
    } finally {
      set({ isLoading: false });
    }
  },

  addProvider: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const provider = await providersApi.create(data);
      set((s) => ({ providers: [...s.providers, provider] }));
      // Fetch models for the new provider
      await get().fetchModels(provider.id);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to add provider" });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  updateProvider: async (id, data) => {
    set({ error: null });
    try {
      const updated = await providersApi.update(id, data);
      set((s) => ({
        providers: s.providers.map((p) => (p.id === id ? updated : p)),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update provider" });
      throw e;
    }
  },

  removeProvider: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await providersApi.remove(id);
      set((s) => {
        const { [id]: _, ...remainingModels } = s.modelsByProvider;
        void _;
        return {
          providers: s.providers.filter((p) => p.id !== id),
          modelsByProvider: remainingModels,
        };
      });
      // Refresh active model in case it was from the deleted provider
      await get().fetchActiveModel();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to remove provider" });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchModels: async (providerId) => {
    try {
      const models = await providersApi.listModels(providerId);
      set((s) => ({
        modelsByProvider: { ...s.modelsByProvider, [providerId]: models },
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to fetch models" });
    }
  },

  refreshModels: async (providerId) => {
    try {
      const models = await providersApi.refreshModels(providerId);
      set((s) => ({
        modelsByProvider: { ...s.modelsByProvider, [providerId]: models },
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to refresh models" });
    }
  },

  fetchActiveModel: async () => {
    try {
      const activeModel = await providersApi.getActiveModel();
      set({ activeModel });
    } catch {
      // Silently fail - active model is optional
    }
  },

  setActiveModel: async (modelId) => {
    try {
      const activeModel = await providersApi.setActiveModel(modelId);
      set({ activeModel });
      // Update the model's isDefault in modelsByProvider
      set((s) => {
        const updated: Record<string, Model[]> = {};
        for (const [pid, models] of Object.entries(s.modelsByProvider)) {
          updated[pid] = models.map((m) => ({
            ...m,
            isDefault: m.id === modelId,
          }));
        }
        return { modelsByProvider: updated };
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to set active model" });
    }
  },

  setActiveModelFromCatalog: async (providerId, catalogModelId, displayName) => {
    try {
      const activeModel = await providersApi.setActiveFromCatalog(providerId, catalogModelId, displayName);
      set({ activeModel });
      // Refresh models for this provider since a new one may have been inserted
      await get().fetchModels(providerId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to set active model" });
    }
  },

  clearError: () => set({ error: null }),
}));
