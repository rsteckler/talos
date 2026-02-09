import { useState, useCallback } from "react"
import { Save, Loader2, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLogStore } from "@/stores"

export function LogSettingsPanel() {
  const settings = useLogStore((s) => s.settings)
  const updateSettings = useLogStore((s) => s.updateSettings)
  const purge = useLogStore((s) => s.purge)

  const [pruneDays, setPruneDays] = useState<string>(String(settings?.pruneDays ?? 7))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [purging, setPurging] = useState(false)
  const [purgeResult, setPurgeResult] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    const days = Number(pruneDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) return
    setSaving(true)
    try {
      await updateSettings(days)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [pruneDays, updateSettings])

  const handlePurge = useCallback(async () => {
    setPurging(true)
    setPurgeResult(null)
    try {
      const deleted = await purge()
      setPurgeResult(`Purged ${deleted} log entries`)
      setTimeout(() => setPurgeResult(null), 3000)
    } finally {
      setPurging(false)
    }
  }, [purge])

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="prune-days">Auto-prune after (days)</Label>
          <Input
            id="prune-days"
            type="number"
            min={1}
            max={365}
            value={pruneDays}
            onChange={(e) => setPruneDays(e.target.value)}
            className="w-24"
          />
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : saved ? (
            <Check className="mr-2 size-4" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="destructive"
          size="sm"
          onClick={handlePurge}
          disabled={purging}
        >
          {purging ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 size-4" />
          )}
          Purge All Logs
        </Button>
        {purgeResult && (
          <span className="text-sm text-muted-foreground">{purgeResult}</span>
        )}
      </div>
    </div>
  )
}
