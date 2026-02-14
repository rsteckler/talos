import { useState } from "react"
import { ChevronRight, Loader2, Check, AlertCircle, ShieldQuestion, Ban } from "lucide-react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/stores/useChatStore"
import { useToolStore } from "@/stores/useToolStore"
import { useConnectionStore } from "@/stores"
import type { ToolCallInfo } from "@talos/shared/types"

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [open, setOpen] = useState(false)

  // Display a friendlier tool name: "shell_execute" → "shell / execute"
  const displayName = toolCall.toolName.replace("_", " / ")
  // Extract the tool ID (part before the underscore)
  const toolId = toolCall.toolName.split("_")[0] ?? toolCall.toolName

  const handleApprove = () => {
    const sendFn = useConnectionStore.getState().sendFn
    if (sendFn) {
      sendFn({ type: "tool_approve", toolCallId: toolCall.toolCallId })
    }
    useChatStore.getState().updateToolCallStatus(toolCall.toolCallId, "calling")
  }

  const handleDeny = () => {
    const sendFn = useConnectionStore.getState().sendFn
    if (sendFn) {
      sendFn({ type: "tool_deny", toolCallId: toolCall.toolCallId })
    }
    useChatStore.getState().updateToolCallStatus(toolCall.toolCallId, "denied")
  }

  const handleAlwaysAllow = async () => {
    await useToolStore.getState().setAllowWithoutAsking(toolId, true)
    handleApprove()
  }

  const handleAlwaysDeny = async () => {
    await useToolStore.getState().disableTool(toolId)
    handleDeny()
  }

  if (toolCall.status === "pending_approval") {
    return (
      <div className="my-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-2">
          <ShieldQuestion className="size-3.5" />
          <span className="font-mono font-medium">{displayName}</span>
          <span className="text-amber-400/70">wants to run</span>
        </div>
        <pre className="text-xs rounded bg-zinc-900 px-2 py-1.5 text-zinc-300 overflow-x-auto max-h-24 overflow-y-auto scrollbar-thumb-only mb-2">
          {JSON.stringify(toolCall.args, null, 2)}
        </pre>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-green-600/50 text-green-400 hover:bg-green-600/10" onClick={handleApprove}>
            Yes
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-red-600/50 text-red-400 hover:bg-red-600/10" onClick={handleDeny}>
            No
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-cyan-600/50 text-cyan-400 hover:bg-cyan-600/10" onClick={handleAlwaysAllow}>
            Always Allow
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-zinc-600/50 text-zinc-400 hover:bg-zinc-600/10" onClick={handleAlwaysDeny}>
            Always Deny
          </Button>
        </div>
      </div>
    )
  }

  const statusIcon = {
    calling: <Loader2 className="size-3.5 animate-spin text-cyan-400" />,
    complete: <Check className="size-3.5 text-green-400" />,
    error: <AlertCircle className="size-3.5 text-red-400" />,
    denied: <Ban className="size-3.5 text-red-400" />,
    pending_approval: null, // handled above
  }[toolCall.status]

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1.5">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors">
        <ChevronRight
          className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {statusIcon}
        <span className={`font-mono ${toolCall.status === "denied" ? "line-through text-zinc-500" : ""}`}>{displayName}</span>
        {toolCall.status === "denied" && (
          <span className="text-red-400/70 text-xs">denied</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5">
        <div className="text-xs space-y-1.5">
          <div>
            <span className="text-zinc-500">Args:</span>
            <pre className="mt-0.5 rounded bg-zinc-900 px-2 py-1.5 text-zinc-300 overflow-x-auto max-h-32 overflow-y-auto scrollbar-thumb-only">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <span className="text-zinc-500">Result:</span>
              <pre className="mt-0.5 rounded bg-zinc-900 px-2 py-1.5 text-zinc-300 overflow-x-auto max-h-48 overflow-y-auto scrollbar-thumb-only">
                {typeof toolCall.result === "string"
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
