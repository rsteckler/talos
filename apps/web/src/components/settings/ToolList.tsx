import { useEffect, useMemo, useState } from "react"
import { Settings2, Loader2, Unplug, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToolStore } from "@/stores/useToolStore"
import { ToolConfigDialog } from "./ToolConfigDialog"
import type { ToolInfo } from "@talos/shared/types"

export function ToolList() {
  const { tools, loading, fetchTools, enableTool, disableTool, setAllowWithoutAsking, connectOAuth, disconnectOAuth } = useToolStore()
  const [configTool, setConfigTool] = useState<ToolInfo | null>(null)
  const [search, setSearch] = useState("")

  const filteredTools = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return tools
    return tools.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    )
  }, [tools, search])

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  if (loading && tools.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading tools...
      </div>
    )
  }

  if (tools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tools found. Add tools to the <code>tools/</code> directory.
      </p>
    )
  }

  const handleToggle = async (tool: ToolInfo) => {
    if (tool.isEnabled) {
      await disableTool(tool.id)
    } else {
      await enableTool(tool.id)
    }
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="space-y-3 max-h-[28rem] overflow-y-auto mt-3 pr-1 scrollbar-thumb-only">
        {filteredTools.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No tools match your search.</p>
        )}
        {filteredTools.map((tool) => (
          <div
            key={tool.id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3"
          >
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tool.name}</span>
                <span className="text-xs text-muted-foreground">v{tool.version}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {tool.description}
              </p>
              {tool.credentials.length > 0 && !tool.hasRequiredCredentials && (
                <p className="text-xs text-amber-500 mt-0.5">
                  Credentials required
                </p>
              )}
              {tool.oauth && (
                <div className="flex items-center gap-2 mt-1.5">
                  {tool.oauthConnected ? (
                    <>
                      <span className="text-xs text-emerald-500 font-medium">Connected</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => disconnectOAuth(tool.id)}
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
                      disabled={!tool.hasRequiredCredentials}
                      onClick={() => connectOAuth(tool.id)}
                      title={!tool.hasRequiredCredentials ? "Enter credentials first" : undefined}
                    >
                      Connect Google
                    </Button>
                  )}
                </div>
              )}
              {tool.isEnabled && (
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                  <Switch
                    checked={tool.allowWithoutAsking}
                    onCheckedChange={(checked) => setAllowWithoutAsking(tool.id, checked)}
                    className="scale-75 origin-left"
                  />
                  <span className="text-xs text-muted-foreground">Allow without asking</span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(tool.credentials.length > 0 || tool.settings.length > 0) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setConfigTool(tool)}
                >
                  <Settings2 className="size-4" />
                  <span className="sr-only">Configure {tool.name}</span>
                </Button>
              )}
              <Switch
                checked={tool.isEnabled}
                onCheckedChange={() => handleToggle(tool)}
              />
            </div>
          </div>
        ))}
      </div>

      <ToolConfigDialog
        tool={configTool}
        onClose={() => setConfigTool(null)}
      />
    </>
  )
}
