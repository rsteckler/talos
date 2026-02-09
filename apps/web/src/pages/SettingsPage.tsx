import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Save, Loader2, Check } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettings, type Theme } from "@/contexts/SettingsContext"
import { ProviderList } from "@/components/settings/ProviderList"
import { soulApi } from "@/api/soul"

export function SettingsPage() {
  const { settings, updateSettings } = useSettings()

  const [soulContent, setSoulContent] = useState("")
  const [soulLoading, setSoulLoading] = useState(true)
  const [soulSaving, setSoulSaving] = useState(false)
  const [soulSaved, setSoulSaved] = useState(false)
  const [soulError, setSoulError] = useState<string | null>(null)

  useEffect(() => {
    soulApi.get()
      .then((data) => {
        setSoulContent(data.content)
        setSoulLoading(false)
      })
      .catch((err) => {
        setSoulError(err instanceof Error ? err.message : "Failed to load")
        setSoulLoading(false)
      })
  }, [])

  const handleSoulSave = useCallback(async () => {
    setSoulSaving(true)
    setSoulError(null)
    try {
      await soulApi.update(soulContent)
      setSoulSaved(true)
      setTimeout(() => setSoulSaved(false), 2000)
    } catch (err) {
      setSoulError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSoulSaving(false)
    }
  }, [soulContent])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              <span className="sr-only">Back to chat</span>
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>
      <main className="container max-w-2xl px-4 py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how Talos looks on your device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="theme">Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Select your preferred color scheme.
                  </p>
                </div>
                <Select
                  value={settings.theme}
                  onValueChange={(value: Theme) => updateSettings({ theme: value })}
                >
                  <SelectTrigger id="theme" className="w-[180px]">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model Providers</CardTitle>
              <CardDescription>
                Configure your AI model providers and API keys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProviderList />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Prompt (SOUL.md)</CardTitle>
              <CardDescription>
                Customize Talos's personality, behavior, and instructions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {soulLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <>
                  <textarea
                    value={soulContent}
                    onChange={(e) => setSoulContent(e.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                  />
                  {soulError && (
                    <p className="text-sm text-destructive">{soulError}</p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSoulSave}
                      disabled={soulSaving}
                      size="sm"
                    >
                      {soulSaving ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : soulSaved ? (
                        <Check className="mr-2 size-4" />
                      ) : (
                        <Save className="mr-2 size-4" />
                      )}
                      {soulSaved ? "Saved" : "Save"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
