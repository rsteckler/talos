import { useState } from "react"
import { ChevronRight, Loader2, Check, AlertCircle } from "lucide-react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import type { ToolCallInfo } from "@talos/shared/types"

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [open, setOpen] = useState(false)

  const statusIcon = {
    calling: <Loader2 className="size-3.5 animate-spin text-cyan-400" />,
    complete: <Check className="size-3.5 text-green-400" />,
    error: <AlertCircle className="size-3.5 text-red-400" />,
  }[toolCall.status]

  // Display a friendlier tool name: "shell_execute" → "shell / execute"
  const displayName = toolCall.toolName.replace("_", " / ")

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1.5">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors">
        <ChevronRight
          className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {statusIcon}
        <span className="font-mono">{displayName}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5">
        <div className="text-xs space-y-1.5">
          <div>
            <span className="text-zinc-500">Args:</span>
            <pre className="mt-0.5 rounded bg-zinc-900 px-2 py-1.5 text-zinc-300 overflow-x-auto max-h-32 overflow-y-auto">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <span className="text-zinc-500">Result:</span>
              <pre className="mt-0.5 rounded bg-zinc-900 px-2 py-1.5 text-zinc-300 overflow-x-auto max-h-48 overflow-y-auto">
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
