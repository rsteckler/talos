import { Loader2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LogRow } from "./LogRow"
import type { LogEntry } from "@talos/shared/types"

interface LogTableProps {
  entries: LogEntry[]
  loading: boolean
}

export function LogTable({ entries, loading }: LogTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No log entries found.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">Timestamp</TableHead>
          <TableHead className="w-24">Area</TableHead>
          <TableHead className="w-24">Level</TableHead>
          <TableHead>Message</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </TableBody>
    </Table>
  )
}
