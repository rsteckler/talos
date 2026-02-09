import { useEffect, useState } from "react"
import { Settings2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToolStore } from "@/stores/useToolStore"
import { ToolConfigDialog } from "./ToolConfigDialog"
import type { ToolInfo } from "@talos/shared/types"

export function ToolList() {
  const { tools, loading, fetchTools, enableTool, disableTool } = useToolStore()
  const [configTool, setConfigTool] = useState<ToolInfo | null>(null)

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
      <div className="space-y-3">
        {tools.map((tool) => (
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
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {tool.credentials.length > 0 && (
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
