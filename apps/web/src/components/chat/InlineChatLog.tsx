import { useState } from "react"
import { ChevronRight } from "lucide-react"
import type { LogEntry } from "@talos/shared/types"

interface InlineChatLogProps {
  entry: LogEntry
}

const LEVEL_STYLES: Record<string, string> = {
  high: "bg-red-600/20 text-red-400",
  medium: "bg-yellow-600/20 text-yellow-400",
  low: "bg-blue-600/20 text-blue-400",
  debug: "bg-purple-600/20 text-purple-400",
  verbose: "bg-gray-600/20 text-gray-400",
  error: "bg-red-600/20 text-red-400",
  warn: "bg-yellow-600/20 text-yellow-400",
  info: "bg-green-600/20 text-green-400",
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const ms = String(d.getMilliseconds()).padStart(3, "0")
  return `${time}.${ms}`
}

export function InlineChatLog({ entry }: InlineChatLogProps) {
  const [expanded, setExpanded] = useState(false)
  const hasData = entry.data !== undefined && entry.data !== null
  const levelStyle = LEVEL_STYLES[entry.level] ?? "bg-gray-600/20 text-gray-400"

  return (
    <div className="group">
      <div
        className={`flex items-center gap-2 px-3 py-0.5 font-mono text-xs text-zinc-500 ${
          hasData ? "cursor-pointer hover:bg-zinc-800/50" : ""
        }`}
        onClick={hasData ? () => setExpanded(!expanded) : undefined}
      >
        {hasData && (
          <ChevronRight
            className={`size-3 shrink-0 text-zinc-600 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        )}
        <span className="shrink-0 text-zinc-600">
          {formatTimestamp(entry.timestamp)}
        </span>
        <span className="shrink-0 rounded px-1 py-px bg-zinc-800 text-zinc-400">
          {entry.area}
        </span>
        <span className={`shrink-0 rounded px-1 py-px ${levelStyle}`}>
          {entry.level}
        </span>
        <span className="truncate text-zinc-400">{entry.message}</span>
      </div>
      {expanded && hasData && (
        <pre className="mx-3 mb-1 overflow-x-auto rounded bg-zinc-900/50 p-2 text-xs font-mono text-zinc-500">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  )
}
