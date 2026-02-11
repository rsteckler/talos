import { X, ClipboardCheck, Calendar, Bell } from "lucide-react"
import type { InboxItem } from "@talos/shared/types"
import { Markdown } from "./Markdown"

function typeIcon(type: InboxItem["type"]) {
  switch (type) {
    case "task_result":
      return <ClipboardCheck className="size-4 shrink-0 text-primary" />
    case "schedule_result":
      return <Calendar className="size-4 shrink-0 text-primary" />
    case "notification":
      return <Bell className="size-4 shrink-0 text-primary" />
  }
}

function relativeTime(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  )
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface InboxContextCardProps {
  item: InboxItem
  onDismiss: () => void
}

export function InboxContextCard({ item, onDismiss }: InboxContextCardProps) {
  return (
    <div className="rounded-lg border-l-4 border-primary bg-card/80 px-4 py-3">
      <div className="flex items-start gap-2">
        {typeIcon(item.type)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {item.title}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {relativeTime(item.created_at)}
              </span>
              <button
                onClick={onDismiss}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title="Dismiss context"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-1.5 max-h-40 overflow-auto text-xs text-muted-foreground scrollbar-thumb-only">
            <Markdown>{item.content}</Markdown>
          </div>
        </div>
      </div>
    </div>
  )
}
