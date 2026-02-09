import { useEffect, useState } from "react"
import { Plus, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useProviderStore } from "@/stores"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AddProviderDialog } from "./AddProviderDialog"
import { EditProviderDialog } from "./EditProviderDialog"
import type { Provider } from "@talos/shared/types"

const TYPE_COLORS: Record<string, string> = {
  openai: "bg-green-600/20 text-green-400 border-green-600/30",
  anthropic: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  google: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  openrouter: "bg-purple-600/20 text-purple-400 border-purple-600/30",
}

export function ProviderList() {
  const providers = useProviderStore((s) => s.providers)
  const activeModel = useProviderStore((s) => s.activeModel)
  const fetchProviders = useProviderStore((s) => s.fetchProviders)
  const removeProvider = useProviderStore((s) => s.removeProvider)
  const error = useProviderStore((s) => s.error)
  const clearError = useProviderStore((s) => s.clearError)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null)

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const getActiveModelName = (providerId: string): string | null => {
    if (activeModel.model && activeModel.provider?.id === providerId) {
      return activeModel.model.displayName || activeModel.model.modelId
    }
    return null
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
        <div className="space-y-2">
          {providers.map((provider) => {
            const activeModelName = getActiveModelName(provider.id)
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={TYPE_COLORS[provider.type] ?? ""}>
                    {provider.type}
                  </Badge>
                  <span className="text-sm font-medium truncate">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {activeModelName ?? "No model selected"}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingProvider(provider)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingProvider(provider)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )
          })}
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
      <EditProviderDialog
        provider={editingProvider}
        onOpenChange={(open) => { if (!open) setEditingProvider(null) }}
      />
      <ConfirmDialog
        open={deletingProvider !== null}
        onOpenChange={(open) => { if (!open) setDeletingProvider(null) }}
        title="Delete Provider"
        description={`Delete "${deletingProvider?.name}"? This cannot be undone.`}
        onConfirm={() => {
          if (deletingProvider) removeProvider(deletingProvider.id)
        }}
      />
    </div>
  )
}
