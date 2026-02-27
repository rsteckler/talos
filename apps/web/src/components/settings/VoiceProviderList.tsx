import { useEffect, useState } from "react"
import { Plus, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useVoiceStore } from "@/stores/useVoiceStore"
import type { VoiceProvider, VoiceProviderType } from "@talos/shared/types"

const TYPE_COLORS: Record<VoiceProviderType, string> = {
  openai: "bg-green-600/20 text-green-400 border-green-600/30",
  elevenlabs: "bg-purple-600/20 text-purple-400 border-purple-600/30",
}

const TYPE_LABELS: Record<VoiceProviderType, string> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
}

export function VoiceProviderList() {
  const providers = useVoiceStore((s) => s.providers)
  const fetchProviders = useVoiceStore((s) => s.fetchProviders)
  const addProvider = useVoiceStore((s) => s.addProvider)
  const updateProvider = useVoiceStore((s) => s.updateProvider)
  const removeProvider = useVoiceStore((s) => s.removeProvider)
  const error = useVoiceStore((s) => s.error)
  const clearError = useVoiceStore((s) => s.clearError)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<VoiceProvider | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<VoiceProvider | null>(null)

  // Form state
  const [formType, setFormType] = useState<VoiceProviderType>("openai")
  const [formName, setFormName] = useState("OpenAI")
  const [formApiKey, setFormApiKey] = useState("")
  const [formBaseUrl, setFormBaseUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  // Initialize form when editing
  useEffect(() => {
    if (editingProvider) {
      setFormName(editingProvider.name)
      setFormApiKey("")
      setFormBaseUrl(editingProvider.baseUrl ?? "")
      setFormError(null)
    }
  }, [editingProvider])

  const isEditing = editingProvider !== null
  const isDialogVisible = dialogOpen || isEditing

  const resetForm = () => {
    setFormType("openai")
    setFormName("OpenAI")
    setFormApiKey("")
    setFormBaseUrl("")
    setFormError(null)
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm()
      setDialogOpen(false)
      setEditingProvider(null)
    }
  }

  const handleTypeChange = (value: VoiceProviderType) => {
    setFormType(value)
    setFormName(TYPE_LABELS[value])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isEditing && !formApiKey.trim()) {
      setFormError("API key is required")
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      if (isEditing) {
        const changes: { name?: string; apiKey?: string; baseUrl?: string | null } = {}
        if (formName.trim() && formName.trim() !== editingProvider.name) {
          changes.name = formName.trim()
        }
        if (formApiKey.trim()) {
          changes.apiKey = formApiKey.trim()
        }
        const newBaseUrl = formBaseUrl.trim() || null
        if (newBaseUrl !== (editingProvider.baseUrl ?? null)) {
          changes.baseUrl = newBaseUrl
        }

        if (!changes.name && !changes.apiKey && changes.baseUrl === undefined) {
          handleDialogClose(false)
          return
        }

        await updateProvider(editingProvider.id, changes)
      } else {
        await addProvider({
          name: formName.trim() || TYPE_LABELS[formType],
          type: formType,
          apiKey: formApiKey.trim(),
          baseUrl: formBaseUrl.trim() || undefined,
        })
      }
      handleDialogClose(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : `Failed to ${isEditing ? "update" : "add"} provider`)
    } finally {
      setIsSubmitting(false)
    }
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
          No voice providers configured. Add one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={TYPE_COLORS[provider.type] ?? ""}>
                  {provider.type}
                </Badge>
                <span className="text-sm font-medium truncate">{provider.name}</span>
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
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => { resetForm(); setDialogOpen(true) }}
      >
        <Plus className="mr-2 size-4" />
        Add Voice Provider
      </Button>

      <Dialog open={isDialogVisible} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Voice Provider" : "Add Voice Provider"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="voice-provider-type">Provider Type</Label>
                <Select value={formType} onValueChange={(v) => handleTypeChange(v as VoiceProviderType)}>
                  <SelectTrigger id="voice-provider-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="voice-provider-name">Display Name</Label>
              <Input
                id="voice-provider-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. OpenAI Voice"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice-api-key">API Key</Label>
              <Input
                id="voice-api-key"
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder={isEditing ? "Leave blank to keep current" : "sk-..."}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice-base-url">Base URL (optional)</Label>
              <Input
                id="voice-base-url"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? (isEditing ? "Saving..." : "Adding...")
                  : (isEditing ? "Save" : "Add Provider")
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingProvider !== null}
        onOpenChange={(open) => { if (!open) setDeletingProvider(null) }}
        title="Delete Voice Provider"
        description={`Delete "${deletingProvider?.name}"? This cannot be undone.`}
        onConfirm={() => {
          if (deletingProvider) removeProvider(deletingProvider.id)
        }}
      />
    </div>
  )
}
