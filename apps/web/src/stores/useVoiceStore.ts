import { create } from "zustand"
import type {
  VoiceProvider,
  VoiceProviderCreateRequest,
  VoiceProviderUpdateRequest,
  VoiceRoleAssignment,
  VoiceSettings,
  VoiceModelCatalog,
} from "@talos/shared/types"
import { voiceApi } from "@/api/voice"

interface VoiceState {
  providers: VoiceProvider[]
  modelsByProvider: Record<string, VoiceModelCatalog>
  roles: VoiceRoleAssignment[]
  settings: VoiceSettings | null
  isLoading: boolean
  error: string | null

  fetchProviders: () => Promise<void>
  addProvider: (data: VoiceProviderCreateRequest) => Promise<void>
  updateProvider: (id: string, data: VoiceProviderUpdateRequest) => Promise<void>
  removeProvider: (id: string) => Promise<void>
  fetchModels: (providerId: string) => Promise<void>
  fetchRoles: () => Promise<void>
  setRole: (role: string, voiceProviderId: string, modelId: string, voice?: string | null) => Promise<void>
  removeRole: (role: string) => Promise<void>
  fetchSettings: () => Promise<void>
  updateSettings: (data: Partial<VoiceSettings>) => Promise<void>
  clearError: () => void
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  providers: [],
  modelsByProvider: {},
  roles: [],
  settings: null,
  isLoading: false,
  error: null,

  fetchProviders: async () => {
    set({ isLoading: true, error: null })
    try {
      const providers = await voiceApi.listProviders()
      set({ providers })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to fetch voice providers" })
    } finally {
      set({ isLoading: false })
    }
  },

  addProvider: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const provider = await voiceApi.createProvider(data)
      set((s) => ({ providers: [...s.providers, provider] }))
      await get().fetchModels(provider.id)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to add voice provider" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  updateProvider: async (id, data) => {
    set({ error: null })
    try {
      const updated = await voiceApi.updateProvider(id, data)
      set((s) => ({
        providers: s.providers.map((p) => (p.id === id ? updated : p)),
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update voice provider" })
      throw e
    }
  },

  removeProvider: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await voiceApi.removeProvider(id)
      set((s) => {
        const { [id]: _, ...remainingModels } = s.modelsByProvider
        void _
        return {
          providers: s.providers.filter((p) => p.id !== id),
          modelsByProvider: remainingModels,
        }
      })
      // Refresh roles in case they referenced the deleted provider
      await get().fetchRoles()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to remove voice provider" })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchModels: async (providerId) => {
    try {
      const catalog = await voiceApi.getModels(providerId)
      set((s) => ({
        modelsByProvider: { ...s.modelsByProvider, [providerId]: catalog },
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to fetch voice models" })
    }
  },

  fetchRoles: async () => {
    try {
      const roles = await voiceApi.listRoles()
      set({ roles })
    } catch {
      // Silently fail — roles are optional
    }
  },

  setRole: async (role, voiceProviderId, modelId, voice) => {
    try {
      const assignment = await voiceApi.setRole(role, voiceProviderId, modelId, voice)
      set((s) => ({
        roles: [...s.roles.filter((r) => r.role !== role), assignment],
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to set voice role" })
    }
  },

  removeRole: async (role) => {
    try {
      await voiceApi.removeRole(role)
      set((s) => ({
        roles: s.roles.filter((r) => r.role !== role),
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to remove voice role" })
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await voiceApi.getSettings()
      set({ settings })
    } catch {
      // Silently fail
    }
  },

  updateSettings: async (data) => {
    try {
      const settings = await voiceApi.updateSettings(data)
      set({ settings })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update voice settings" })
    }
  },

  clearError: () => set({ error: null }),
}))
