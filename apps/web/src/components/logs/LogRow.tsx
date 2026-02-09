import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { TableCell, TableRow } from "@/components/ui/table"
import type { LogEntry } from "@talos/shared/types"

interface LogRowProps {
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

export function LogRow({ entry }: LogRowProps) {
  const [expanded, setExpanded] = useState(false)
  const hasData = entry.data !== undefined && entry.data !== null

  const levelStyle = LEVEL_STYLES[entry.level] ?? "bg-gray-600/20 text-gray-400"

  return (
    <>
      <TableRow
        className={hasData ? "cursor-pointer hover:bg-muted/50" : ""}
        onClick={hasData ? () => setExpanded(!expanded) : undefined}
      >
        <TableCell className="font-mono text-xs text-muted-foreground">
          {formatTimestamp(entry.timestamp)}
        </TableCell>
        <TableCell>
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {entry.area}
          </span>
        </TableCell>
        <TableCell>
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${levelStyle}`}>
            {entry.axis !== "dev" || !["debug", "verbose"].includes(entry.level)
              ? entry.level
              : `${entry.axis}.${entry.level}`}
          </span>
        </TableCell>
        <TableCell className="max-w-md truncate text-sm">
          <div className="flex items-center gap-1">
            {hasData && (
              <ChevronRight
                className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
              />
            )}
            {entry.message}
          </div>
        </TableCell>
      </TableRow>
      {expanded && hasData && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30 p-0">
            <pre className="overflow-x-auto p-3 text-xs font-mono text-muted-foreground">
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
