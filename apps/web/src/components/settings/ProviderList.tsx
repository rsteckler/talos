import { useEffect, useState } from "react"
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useProviderStore } from "@/stores"
import { AddProviderDialog } from "./AddProviderDialog"
import type { Provider } from "@talos/shared/types"

const TYPE_COLORS: Record<string, string> = {
  openai: "bg-green-600/20 text-green-400 border-green-600/30",
  anthropic: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  google: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  openrouter: "bg-purple-600/20 text-purple-400 border-purple-600/30",
}

export function ProviderList() {
  const providers = useProviderStore((s) => s.providers)
  const modelsByProvider = useProviderStore((s) => s.modelsByProvider)
  const activeModel = useProviderStore((s) => s.activeModel)
  const fetchProviders = useProviderStore((s) => s.fetchProviders)
  const fetchModels = useProviderStore((s) => s.fetchModels)
  const removeProvider = useProviderStore((s) => s.removeProvider)
  const refreshModels = useProviderStore((s) => s.refreshModels)
  const setActiveModel = useProviderStore((s) => s.setActiveModel)
  const error = useProviderStore((s) => s.error)
  const clearError = useProviderStore((s) => s.clearError)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  // Fetch models for all providers
  useEffect(() => {
    for (const p of providers) {
      if (!modelsByProvider[p.id]) {
        fetchModels(p.id)
      }
    }
  }, [providers, modelsByProvider, fetchModels])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>Dismiss</Button>
        </div>
      )}

      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No providers configured. Add one to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              models={modelsByProvider[provider.id] ?? []}
              activeModelId={activeModel.model?.id ?? null}
              isExpanded={expandedIds.has(provider.id)}
              onToggle={() => toggleExpanded(provider.id)}
              onDelete={() => removeProvider(provider.id)}
              onRefresh={() => refreshModels(provider.id)}
              onSelectModel={(modelId) => setActiveModel(modelId)}
            />
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="mr-2 size-4" />
        Add Provider
      </Button>

      <AddProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

interface ProviderCardProps {
  provider: Provider;
  models: { id: string; modelId: string; displayName: string; isDefault: boolean }[];
  activeModelId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onSelectModel: (modelId: string) => void;
}

function ProviderCard({
  provider,
  models,
  activeModelId,
  isExpanded,
  onToggle,
  onDelete,
  onRefresh,
  onSelectModel,
}: ProviderCardProps) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {provider.name}
          <Badge variant="outline" className={TYPE_COLORS[provider.type] ?? ""}>
            {provider.type}
          </Badge>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Models
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRefresh}>
              <RefreshCw className="mr-1 size-3" />
              Refresh
            </Button>
          </div>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No models available.</p>
          ) : (
            <div className="space-y-1">
              {models.map((model) => (
                <label
                  key={model.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="active-model"
                    checked={model.id === activeModelId}
                    onChange={() => onSelectModel(model.id)}
                    className="accent-primary"
                  />
                  <span>{model.displayName}</span>
                  <span className="text-xs text-muted-foreground">{model.modelId}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
