import { useState, useEffect, useCallback, useRef } from "react"
import { ArrowLeft, Save, Loader2, Check, ScrollText, Upload, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettings, type Theme } from "@/contexts/SettingsContext"
import { ProviderList } from "@/components/settings/ProviderList"
import { ToolList } from "@/components/settings/ToolList"
import { ChannelList } from "@/components/settings/ChannelList"
import { soulApi } from "@/api/soul"
import { themesApi } from "@/api/themes"
import { ACCENT_COLORS } from "@/lib/accent-colors"
import { cn } from "@/lib/utils"
import type { ThemeMeta, ThemeFile } from "@talos/shared/types"

export function SettingsPage() {
  const { settings, updateSettings } = useSettings()

  const [soulContent, setSoulContent] = useState("")
  const [soulLoading, setSoulLoading] = useState(true)
  const [soulSaving, setSoulSaving] = useState(false)
  const [soulSaved, setSoulSaved] = useState(false)
  const [soulError, setSoulError] = useState<string | null>(null)

  // Theme state
  const [themes, setThemes] = useState<ThemeMeta[]>([])
  const [themesLoading, setThemesLoading] = useState(true)
  const [themeError, setThemeError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const loadThemes = useCallback(() => {
    setThemesLoading(true)
    themesApi.list()
      .then((data) => {
        setThemes(data)
        setThemesLoading(false)
      })
      .catch(() => {
        setThemesLoading(false)
      })
  }, [])

  useEffect(() => {
    loadThemes()
  }, [loadThemes])

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

  const handleAccentChange = (id: string | null) => {
    updateSettings({ accentColor: id })
  }

  const handleThemeChange = (value: string) => {
    if (value === "none") {
      updateSettings({ customTheme: null })
    } else {
      updateSettings({ customTheme: value })
    }
  }

  const handleThemeUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setThemeError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as ThemeFile

      if (!parsed.id || !parsed.name || !parsed.light || !parsed.dark) {
        setThemeError("Invalid theme file: missing required fields (id, name, light, dark)")
        return
      }

      await themesApi.upload(parsed)
      loadThemes()
      updateSettings({ customTheme: parsed.id })
    } catch (err) {
      if (err instanceof SyntaxError) {
        setThemeError("Invalid JSON file")
      } else {
        setThemeError(err instanceof Error ? err.message : "Failed to upload theme")
      }
    } finally {
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleThemeDelete = async (id: string) => {
    try {
      await themesApi.remove(id)
      if (settings.customTheme === id) {
        updateSettings({ customTheme: null })
      }
      loadThemes()
    } catch (err) {
      setThemeError(err instanceof Error ? err.message : "Failed to delete theme")
    }
  }

  const hasCustomTheme = !!settings.customTheme
  const selectedThemeMeta = themes.find((t) => t.id === settings.customTheme)

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
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
            <CardContent className="space-y-6">
              {/* Mode */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="theme">Mode</Label>
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

              {/* Accent Color */}
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <Label>Accent Color</Label>
                  <p className="text-sm text-muted-foreground">
                    {hasCustomTheme
                      ? "Disabled while a custom theme is active."
                      : "Tint the primary color across the interface."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Default (no accent) */}
                  <button
                    type="button"
                    disabled={hasCustomTheme}
                    onClick={() => handleAccentChange(null)}
                    className={cn(
                      "relative size-8 rounded-full border-2 transition-colors",
                      "bg-gradient-to-br from-zinc-300 to-zinc-600",
                      !hasCustomTheme && !settings.accentColor
                        ? "border-foreground"
                        : "border-transparent hover:border-muted-foreground/50",
                      hasCustomTheme && "opacity-40 cursor-not-allowed",
                    )}
                    title="Default"
                  >
                    {!hasCustomTheme && !settings.accentColor && (
                      <Check className="absolute inset-0 m-auto size-3.5 text-white" />
                    )}
                  </button>
                  {Object.entries(ACCENT_COLORS).map(([id, def]) => (
                    <button
                      key={id}
                      type="button"
                      disabled={hasCustomTheme}
                      onClick={() => handleAccentChange(id)}
                      className={cn(
                        "relative size-8 rounded-full border-2 transition-colors",
                        !hasCustomTheme && settings.accentColor === id
                          ? "border-foreground"
                          : "border-transparent hover:border-muted-foreground/50",
                        hasCustomTheme && "opacity-40 cursor-not-allowed",
                      )}
                      style={{ backgroundColor: def.swatch }}
                      title={def.label}
                    >
                      {!hasCustomTheme && settings.accentColor === id && (
                        <Check className="absolute inset-0 m-auto size-3.5 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Theme */}
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <Label>Custom Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply a complete color theme or upload your own.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={settings.customTheme ?? "none"}
                    onValueChange={handleThemeChange}
                    disabled={themesLoading}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {themes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleThemeUpload}
                    title="Upload theme"
                  >
                    <Upload className="size-4" />
                  </Button>
                  {selectedThemeMeta && !selectedThemeMeta.builtIn && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleThemeDelete(selectedThemeMeta.id)}
                      title="Delete theme"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {themeError && (
                  <p className="text-sm text-destructive">{themeError}</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelected}
                  className="hidden"
                />
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
              <CardTitle>Tools</CardTitle>
              <CardDescription>
                Enable and configure tools that Talos can use during conversations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ToolList />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
              <CardDescription>
                Connect external messaging platforms to chat with Talos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChannelList />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logging</CardTitle>
              <CardDescription>
                View logs, configure verbosity, and manage log retention.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" asChild>
                <Link to="/logs">
                  <ScrollText className="mr-2 size-4" />
                  Open Log Viewer
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Debug</CardTitle>
              <CardDescription>
                Developer tools for troubleshooting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-logs-in-chat">Show logs in chat</Label>
                  <p className="text-sm text-muted-foreground">
                    Display server logs inline with chat messages.
                  </p>
                </div>
                <Switch
                  id="show-logs-in-chat"
                  checked={settings.showLogsInChat}
                  onCheckedChange={(checked) =>
                    updateSettings({ showLogsInChat: checked })
                  }
                />
              </div>
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
