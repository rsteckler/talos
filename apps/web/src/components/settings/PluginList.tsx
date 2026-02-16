import { useEffect, useMemo, useState } from "react"
import { Settings2, Loader2, Unplug, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { usePluginStore } from "@/stores/usePluginStore"
import { PluginConfigDialog } from "./PluginConfigDialog"
import type { PluginInfo } from "@talos/shared/types"

export function PluginList() {
  const { plugins, loading, fetchPlugins, enablePlugin, disablePlugin, setAllowWithoutAsking, connectOAuth, disconnectOAuth } = usePluginStore()
  const [configPlugin, setConfigPlugin] = useState<PluginInfo | null>(null)
  const [search, setSearch] = useState("")

  const filteredPlugins = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return plugins
    return plugins.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    )
  }, [plugins, search])

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  if (loading && plugins.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading plugins...
      </div>
    )
  }

  if (plugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No plugins found. Add plugins to the <code>plugins/</code> directory.
      </p>
    )
  }

  const handleToggle = async (plugin: PluginInfo) => {
    if (plugin.isEnabled) {
      await disablePlugin(plugin.id)
    } else {
      await enablePlugin(plugin.id)
    }
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search plugins..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="space-y-3 max-h-[28rem] overflow-y-auto mt-3 pr-1 scrollbar-thumb-only">
        {filteredPlugins.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No plugins match your search.</p>
        )}
        {filteredPlugins.map((plugin) => (
          <div
            key={plugin.id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3"
          >
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{plugin.name}</span>
                <span className="text-xs text-muted-foreground">v{plugin.version}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {plugin.description}
              </p>
              {plugin.credentials.length > 0 && !plugin.hasRequiredCredentials && (
                <p className="text-xs text-amber-500 mt-0.5">
                  Credentials required
                </p>
              )}
              {plugin.oauth && (
                <div className="flex items-center gap-2 mt-1.5">
                  {plugin.oauthConnected ? (
                    <>
                      <span className="text-xs text-emerald-500 font-medium">Connected</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => disconnectOAuth(plugin.id)}
                      >
                        <Unplug className="size-3 mr-1" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={!plugin.hasRequiredCredentials}
                      onClick={() => connectOAuth(plugin.id)}
                      title={!plugin.hasRequiredCredentials ? "Enter credentials first" : undefined}
                    >
                      Connect Google
                    </Button>
                  )}
                </div>
              )}
              {plugin.isEnabled && (
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                  <Switch
                    checked={plugin.allowWithoutAsking}
                    onCheckedChange={(checked) => setAllowWithoutAsking(plugin.id, checked)}
                    className="scale-75 origin-left"
                  />
                  <span className="text-xs text-muted-foreground">Allow without asking</span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(plugin.credentials.length > 0 || plugin.settings.length > 0) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setConfigPlugin(plugin)}
                >
                  <Settings2 className="size-4" />
                  <span className="sr-only">Configure {plugin.name}</span>
                </Button>
              )}
              <Switch
                checked={plugin.isEnabled}
                onCheckedChange={() => handleToggle(plugin)}
              />
            </div>
          </div>
        ))}
      </div>

      <PluginConfigDialog
        plugin={configPlugin}
        onClose={() => setConfigPlugin(null)}
      />
    </>
  )
}
