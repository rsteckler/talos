import { useState, useEffect } from "react"
import { Loader2, ExternalLink } from "lucide-react"
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
import { useToolStore } from "@/stores/useToolStore"
import type { ToolInfo } from "@talos/shared/types"

interface ToolConfigDialogProps {
  tool: ToolInfo | null;
  onClose: () => void;
}

export function ToolConfigDialog({ tool, onClose }: ToolConfigDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const updateConfig = useToolStore((s) => s.updateConfig)

  useEffect(() => {
    if (tool) {
      // Initialize with empty values for all credential fields
      const initial: Record<string, string> = {}
      for (const cred of tool.credentials) {
        initial[cred.name] = ""
      }
      // Initialize settings with defaults
      for (const setting of tool.settings) {
        initial[setting.name] = setting.default
      }
      setValues(initial)
    }
  }, [tool])

  if (!tool) return null

  const handleSave = async () => {
    setSaving(true)
    // Only send non-empty values (don't overwrite with empty strings)
    const nonEmpty: Record<string, string> = {}
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) {
        nonEmpty[key] = value.trim()
      }
    }
    if (Object.keys(nonEmpty).length > 0) {
      await updateConfig(tool.id, nonEmpty)
    }
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={!!tool} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {tool.name}</DialogTitle>
          <DialogDescription>
            Enter the credentials required by this tool. Leave fields empty to keep existing values.
          </DialogDescription>
          {tool.oauth?.provider === "google" && (
            <a
              href="/docs/guides/google-workspace-setup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              How to get Google OAuth credentials
              <ExternalLink className="size-3" />
            </a>
          )}
          {tool.id === "google-maps" && (
            <a
              href="/docs/guides/google-maps-setup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              How to get a Google Maps API key
              <ExternalLink className="size-3" />
            </a>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          {tool.credentials.map((cred) => (
            <div key={cred.name} className="space-y-1.5">
              <Label htmlFor={`cred-${cred.name}`}>
                {cred.label}
                {cred.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {cred.description && (
                <p className="text-xs text-muted-foreground">{cred.description}</p>
              )}
              <Input
                id={`cred-${cred.name}`}
                type="password"
                placeholder={`Enter ${cred.label.toLowerCase()}`}
                value={values[cred.name] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [cred.name]: e.target.value }))
                }
              />
            </div>
          ))}

          {tool.settings.length > 0 && (
            <>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Settings</p>
              </div>
              {tool.settings.map((setting) => (
                <div key={setting.name} className="space-y-1.5">
                  <Label htmlFor={`setting-${setting.name}`}>
                    {setting.label}
                  </Label>
                  {setting.description && (
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  )}
                  <Input
                    id={`setting-${setting.name}`}
                    type={setting.type === "number" ? "number" : "text"}
                    placeholder={setting.default}
                    value={values[setting.name] ?? setting.default}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [setting.name]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
