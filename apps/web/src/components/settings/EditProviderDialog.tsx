import { useEffect, useMemo, useState } from "react"
import { Search, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useProviderStore } from "@/stores"
import { providersApi } from "@/api"
import type { Provider, CatalogModel } from "@talos/shared/types"

interface EditProviderDialogProps {
  provider: Provider | null;
  onOpenChange: (open: boolean) => void;
}

const TYPE_COLORS: Record<string, string> = {
  openai: "bg-green-600/20 text-green-400 border-green-600/30",
  anthropic: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  google: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  openrouter: "bg-purple-600/20 text-purple-400 border-purple-600/30",
}

export function EditProviderDialog({ provider, onOpenChange }: EditProviderDialogProps) {
  const activeModel = useProviderStore((s) => s.activeModel)
  const modelsByProvider = useProviderStore((s) => s.modelsByProvider)
  const updateProvider = useProviderStore((s) => s.updateProvider)
  const setActiveModel = useProviderStore((s) => s.setActiveModel)
  const setActiveModelFromCatalog = useProviderStore((s) => s.setActiveModelFromCatalog)

  const [name, setName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Catalog state
  const [catalog, setCatalog] = useState<CatalogModel[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // Initialize form when provider changes
  useEffect(() => {
    if (provider) {
      setName(provider.name)
      setApiKey("")
      setBaseUrl(provider.baseUrl ?? "")
      setSaveError(null)
      setSearch("")
    }
  }, [provider])

  // Fetch catalog when provider opens
  useEffect(() => {
    if (!provider) return
    fetchCatalog(provider.id)
  }, [provider?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCatalog = async (providerId: string) => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const models = await providersApi.fetchCatalog(providerId)
      setCatalog(models)
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Failed to fetch models")
      setCatalog([])
    } finally {
      setCatalogLoading(false)
    }
  }

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalog
    const q = search.toLowerCase()
    return catalog.filter(
      (m) => m.modelId.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q)
    )
  }, [catalog, search])

  const activeModelId = activeModel.model && activeModel.provider?.id === provider?.id
    ? activeModel.model.modelId
    : null

  const handleSelectModel = async (catalogModel: CatalogModel) => {
    if (!provider) return

    // Check if this model already exists in the DB
    const dbModels = modelsByProvider[provider.id] ?? []
    const existing = dbModels.find((m) => m.modelId === catalogModel.modelId)

    if (existing) {
      await setActiveModel(existing.id)
    } else {
      await setActiveModelFromCatalog(provider.id, catalogModel.modelId, catalogModel.displayName)
    }
  }

  const handleSave = async () => {
    if (!provider) return

    const changes: import("@talos/shared/types").ProviderUpdateRequest = {}
    if (name.trim() && name.trim() !== provider.name) changes.name = name.trim()
    if (apiKey.trim()) changes.apiKey = apiKey.trim()
    const newBaseUrl = baseUrl.trim() || null
    if (newBaseUrl !== (provider.baseUrl ?? null)) changes.baseUrl = newBaseUrl

    if (!changes.name && !changes.apiKey && changes.baseUrl === undefined) {
      onOpenChange(false)
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await updateProvider(provider.id, changes)
      onOpenChange(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to update provider")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={provider !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Provider</DialogTitle>
          <DialogDescription>
            Update provider settings and select an active model.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Provider info section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Badge variant="outline" className={TYPE_COLORS[provider?.type ?? ""] ?? ""}>
                {provider?.type}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">Display Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Provider name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-api-key">API Key</Label>
              <Input
                id="edit-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave empty to keep current key"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-base-url">Base URL</Label>
              <Input
                id="edit-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
          </div>

          <Separator />

          {/* Model catalog section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Available Models</span>
                {!catalogLoading && !catalogError && (
                  <Badge variant="secondary" className="text-xs">
                    {filteredCatalog.length}
                  </Badge>
                )}
              </div>
              {!catalogLoading && provider && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => fetchCatalog(provider.id)}
                >
                  <RefreshCw className="mr-1 size-3" />
                  Retry
                </Button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="pl-9"
              />
            </div>

            {/* Model list */}
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {catalogLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                      <Skeleton className="size-4 rounded-full shrink-0" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))}
                </div>
              ) : catalogError ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-destructive">{catalogError}</p>
                </div>
              ) : filteredCatalog.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  {search ? "No models match your search." : "No models available."}
                </p>
              ) : (
                <div className="divide-y">
                  {filteredCatalog.map((model) => {
                    const isActive = model.modelId === activeModelId
                    return (
                      <button
                        key={model.modelId}
                        onClick={() => handleSelectModel(model)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                          isActive ? "bg-muted/30" : ""
                        }`}
                      >
                        <span
                          className={`size-3.5 shrink-0 rounded-full border-2 ${
                            isActive
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40"
                          }`}
                        />
                        <span className="truncate">{model.displayName}</span>
                        {model.displayName !== model.modelId && (
                          <span className="text-xs text-muted-foreground truncate ml-auto shrink-0">
                            {model.modelId}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
