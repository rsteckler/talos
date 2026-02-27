import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useVoiceStore } from "@/stores/useVoiceStore"
import type { VoiceRole } from "@talos/shared/types"

const OPENAI_VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]

interface RoleSectionProps {
  role: VoiceRole
  label: string
  description: string
}

function RoleSection({ role, label, description }: RoleSectionProps) {
  const providers = useVoiceStore((s) => s.providers)
  const modelsByProvider = useVoiceStore((s) => s.modelsByProvider)
  const roles = useVoiceStore((s) => s.roles)
  const fetchModels = useVoiceStore((s) => s.fetchModels)
  const setRole = useVoiceStore((s) => s.setRole)
  const removeRole = useVoiceStore((s) => s.removeRole)

  const [selectedProviderId, setSelectedProviderId] = useState("")
  const [selectedModelId, setSelectedModelId] = useState("")
  const [voice, setVoice] = useState("")

  const assignment = roles.find((r) => r.role === role)

  // Pre-fill form from existing assignment
  useEffect(() => {
    if (assignment) {
      setSelectedProviderId(assignment.voiceProviderId)
      setSelectedModelId(assignment.modelId)
      setVoice(assignment.voice ?? "")
    }
  }, [assignment?.voiceProviderId, assignment?.modelId, assignment?.voice])
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const catalog = selectedProviderId ? modelsByProvider[selectedProviderId] : undefined
  const availableModels = catalog ? (role === "tts" ? catalog.tts : catalog.stt) : []
  const showVoice = role === "tts"

  // When provider changes, fetch models
  useEffect(() => {
    if (selectedProviderId && !modelsByProvider[selectedProviderId]) {
      fetchModels(selectedProviderId)
    }
  }, [selectedProviderId, modelsByProvider, fetchModels])

  // Reset model and voice when provider changes
  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId)
    setSelectedModelId("")
    setVoice("")
  }

  const handleAssign = () => {
    if (!selectedProviderId || !selectedModelId) return
    setRole(role, selectedProviderId, selectedModelId, voice.trim() || null)
  }

  const handleClear = () => {
    removeRole(role)
    setSelectedProviderId("")
    setSelectedModelId("")
    setVoice("")
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Provider</Label>
          <Select value={selectedProviderId} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Model</Label>
          <Select
            value={selectedModelId}
            onValueChange={setSelectedModelId}
            disabled={!selectedProviderId || availableModels.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !selectedProviderId
                  ? "Select provider first"
                  : availableModels.length === 0
                    ? "No models available"
                    : "Select model"
              } />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showVoice && selectedProviderId && (
        <div className="space-y-1.5">
          <Label className="text-xs">Voice</Label>
          {selectedProvider?.type === "openai" ? (
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger>
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_VOICES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder="Enter voice ID"
            />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleAssign}
          disabled={!selectedProviderId || !selectedModelId}
        >
          Assign
        </Button>
        {assignment && (
          <Button size="sm" variant="outline" onClick={handleClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}

export function VoiceRoleSettings() {
  const fetchProviders = useVoiceStore((s) => s.fetchProviders)
  const fetchRoles = useVoiceStore((s) => s.fetchRoles)
  const fetchModels = useVoiceStore((s) => s.fetchModels)

  useEffect(() => {
    fetchProviders().then(() => {
      const state = useVoiceStore.getState()
      for (const p of state.providers) {
        if (!state.modelsByProvider[p.id]) {
          fetchModels(p.id)
        }
      }
    })
    fetchRoles()
  }, [fetchProviders, fetchRoles, fetchModels])

  return (
    <div className="space-y-6">
      <RoleSection
        role="tts"
        label="Text-to-Speech (TTS)"
        description="Voice provider and model used to generate speech from text"
      />
      <RoleSection
        role="stt"
        label="Speech-to-Text (STT)"
        description="Voice provider and model used to transcribe speech to text"
      />
    </div>
  )
}
