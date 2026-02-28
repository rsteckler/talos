import { useState, useEffect, useMemo, useCallback } from "react"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useProviderStore } from "@/stores"
import { providersApi } from "@/api"
import type { Provider, CatalogModel } from "@talos/shared/types"
import { cn } from "@/lib/utils"

const TYPE_COLORS: Record<string, string> = {
  openai: "bg-green-600/20 text-green-400 border-green-600/30",
  anthropic: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  google: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  openrouter: "bg-purple-600/20 text-purple-400 border-purple-600/30",
}

interface ProviderCatalog {
  provider: Provider
  models: CatalogModel[]
}

export function ModelSwitcher() {
  const activeModel = useProviderStore((s) => s.activeModel)
  const roleAssignments = useProviderStore((s) => s.roleAssignments)
  const [open, setOpen] = useState(false)

  // Show chat role model if assigned, otherwise fall back to default
  const chatRole = roleAssignments.find((r) => r.role === "chat")
  const displayName = chatRole?.modelDisplayName ?? activeModel.model?.displayName ?? "No model"

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{displayName}</span>
        <svg
          className="size-3"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      <ModelPickerDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

interface ModelPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ModelPickerDialog({ open, onOpenChange }: ModelPickerDialogProps) {
  const activeModel = useProviderStore((s) => s.activeModel)
  const roleAssignments = useProviderStore((s) => s.roleAssignments)
  const setActiveModelFromCatalog = useProviderStore((s) => s.setActiveModelFromCatalog)
  const setRole = useProviderStore((s) => s.setRole)
  const fetchModels = useProviderStore((s) => s.fetchModels)
  const modelsByProvider = useProviderStore((s) => s.modelsByProvider)

  const [catalogs, setCatalogs] = useState<ProviderCatalog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // Fetch all provider catalogs when dialog opens
  useEffect(() => {
    if (!open) {
      setSearch("")
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        // Always fetch fresh providers
        const providers = await providersApi.list()
        if (cancelled) return

        // Fetch catalogs in parallel
        const results = await Promise.allSettled(
          providers.map(async (provider) => {
            const models = await providersApi.fetchCatalog(provider.id)
            return { provider, models } satisfies ProviderCatalog
          }),
        )
        if (cancelled) return

        const loaded: ProviderCatalog[] = []
        for (const result of results) {
          if (result.status === "fulfilled") {
            loaded.push(result.value)
          }
        }
        setCatalogs(loaded)

        // Ensure DB models are loaded for active model highlighting
        for (const p of providers) {
          fetchModels(p.id)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load models")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return catalogs
      .map(({ provider, models }) => ({
        provider,
        models: q
          ? models.filter(
              (m) =>
                m.modelId.toLowerCase().includes(q) ||
                m.displayName.toLowerCase().includes(q),
            )
          : models,
      }))
      .filter((g) => g.models.length > 0)
  }, [catalogs, search])

  const totalCount = useMemo(
    () => filtered.reduce((n, g) => n + g.models.length, 0),
    [filtered],
  )

  const handleSelect = useCallback(
    async (provider: Provider, catalogModel: CatalogModel) => {
      // Check if this model already exists in the DB for this provider
      const dbModels = modelsByProvider[provider.id] ?? []
      const existing = dbModels.find((m) => m.modelId === catalogModel.modelId)

      if (existing) {
        // Set the chat role to this model
        await setRole("chat", existing.id)
      } else {
        // Create model from catalog (also sets it as global default), then set chat role
        const created = await setActiveModelFromCatalog(
          provider.id,
          catalogModel.modelId,
          catalogModel.displayName,
        )
        if (created.model) {
          await setRole("chat", created.model.id)
        }
      }
      onOpenChange(false)
    },
    [modelsByProvider, setRole, setActiveModelFromCatalog, onOpenChange],
  )

  // Resolve effective chat model's modelId + provider for highlighting
  const chatRole = roleAssignments.find((r) => r.role === "chat")
  const activeChatDbId = chatRole?.modelId ?? activeModel.model?.id ?? null
  // Find the API modelId and provider for the active chat model
  const activeChatInfo = useMemo(() => {
    if (!activeChatDbId) return null
    for (const [providerId, models] of Object.entries(modelsByProvider)) {
      const match = models.find((m) => m.id === activeChatDbId)
      if (match) return { modelId: match.modelId, providerId }
    }
    // Fall back to activeModel if not found in modelsByProvider
    if (activeModel.model && activeModel.provider) {
      return { modelId: activeModel.model.modelId, providerId: activeModel.provider.id }
    }
    return null
  }, [activeChatDbId, modelsByProvider, activeModel])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">Switch Model</DialogTitle>
          <DialogDescription className="text-xs">
            Select a model from your configured providers.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto scrollbar-thumb-only border-t px-2 pb-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="size-4 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : totalCount === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {search
                ? "No models match your search."
                : catalogs.length === 0
                  ? "No providers configured."
                  : "No models available."}
            </p>
          ) : (
            filtered.map(({ provider, models }) => (
              <div key={provider.id} className="mt-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {provider.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 leading-4",
                      TYPE_COLORS[provider.type] ?? "",
                    )}
                  >
                    {provider.type}
                  </Badge>
                </div>
                <div className="divide-y divide-border/50">
                  {models.map((model) => {
                    const isActive =
                      activeChatInfo != null &&
                      model.modelId === activeChatInfo.modelId &&
                      provider.id === activeChatInfo.providerId
                    return (
                      <button
                        key={model.modelId}
                        onClick={() => handleSelect(provider, model)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-accent/50 text-accent-foreground"
                            : "text-foreground hover:bg-muted/50",
                        )}
                      >
                        <span
                          className={cn(
                            "size-3 shrink-0 rounded-full border-2",
                            isActive
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40",
                          )}
                        />
                        <span className="truncate">{model.displayName}</span>
                        {model.displayName !== model.modelId && (
                          <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                            {model.modelId}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
