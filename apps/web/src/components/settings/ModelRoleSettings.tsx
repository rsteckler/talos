import { useEffect, useMemo } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useProviderStore } from "@/stores"
import type { ModelRole } from "@talos/shared/types"

const ROLES: { role: ModelRole; label: string; description: string }[] = [
  { role: "chat", label: "Chat", description: "Used for conversational responses" },
  { role: "planner", label: "Planner", description: "Generates multi-step plans" },
  { role: "executor", label: "Executor", description: "Executes individual plan steps" },
  { role: "smart", label: "Smart", description: "Used for complex reasoning steps (falls back to Executor)" },
]

export function ModelRoleSettings() {
  const {
    providers,
    modelsByProvider,
    activeModel,
    roleAssignments,
    fetchProviders,
    fetchModels,
    fetchRoles,
    setRole,
    removeRole,
  } = useProviderStore()

  useEffect(() => {
    fetchProviders().then(() => {
      // Fetch models for each provider
      const state = useProviderStore.getState()
      for (const p of state.providers) {
        if (!state.modelsByProvider[p.id]) {
          fetchModels(p.id)
        }
      }
    })
    fetchRoles()
  }, [fetchProviders, fetchModels, fetchRoles])

  // Build a flat list of all models grouped by provider
  const allModels = useMemo(() => {
    const groups: Array<{ providerName: string; providerId: string; models: Array<{ id: string; displayName: string; modelId: string }> }> = []
    for (const provider of providers) {
      const models = modelsByProvider[provider.id] ?? []
      if (models.length > 0) {
        groups.push({
          providerName: provider.name,
          providerId: provider.id,
          models: models.map((m) => ({ id: m.id, displayName: m.displayName, modelId: m.modelId })),
        })
      }
    }
    return groups
  }, [providers, modelsByProvider])

  const defaultModelName = activeModel.model
    ? `${activeModel.model.displayName} (${activeModel.provider?.name ?? "Unknown"})`
    : "None"

  return (
    <div className="space-y-4">
      {ROLES.map(({ role, label, description }) => {
        const assignment = roleAssignments.find((r) => r.role === role)

        return (
          <div key={role} className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
              {!assignment && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Using default: {defaultModelName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={assignment?.modelId ?? ""}
                onValueChange={(modelId) => {
                  if (modelId) setRole(role, modelId)
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Use default model" />
                </SelectTrigger>
                <SelectContent>
                  {allModels.map((group) => (
                    <SelectGroup key={group.providerId}>
                      <SelectLabel>{group.providerName}</SelectLabel>
                      {group.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.displayName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {assignment && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => removeRole(role)}
                  title="Reset to default"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
