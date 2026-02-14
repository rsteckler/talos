import { useState, useMemo } from "react"
import { Search, Inbox, ClipboardCheck, Calendar, Bell, Trash2, ExternalLink, ChevronDown, ChevronRight, Pin, PinOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useChatStore, useInboxStore } from "@/stores"
import type { InboxItem } from "@talos/shared/types"

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

interface FlowHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FlowHistoryDialog({ open, onOpenChange }: FlowHistoryDialogProps) {
  const items = useInboxStore((s) => s.items)
  const markAsRead = useInboxStore((s) => s.markAsRead)
  const pinItem = useInboxStore((s) => s.pinItem)
  const unpinItem = useInboxStore((s) => s.unpinItem)
  const removeItem = useInboxStore((s) => s.removeItem)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const setInboxContext = useChatStore((s) => s.setInboxContext)

  const [searchQuery, setSearchQuery] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q)
    )
  }, [items, searchQuery])

  const handleOpen = (item: InboxItem) => {
    if (!item.is_read) markAsRead(item.id)
    setActiveConversation(null)
    clearMessages()
    setInboxContext(item)
    onOpenChange(false)
  }

  const handleDelete = async (id: string) => {
    if (expandedId === id) setExpandedId(null)
    await removeItem(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Flow History</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search flows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thumb-only px-6 pb-6 min-h-0">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="size-8 mb-2" />
              <p className="text-sm">
                {searchQuery ? "No flows found" : "No flows yet"}
              </p>
            </div>
          )}

          <div className="space-y-1">
            {filtered.map((item) => (
              <div key={item.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {typeIcon(item.type)}
                  <button
                    onClick={() => {
                      const expanding = expandedId !== item.id
                      setExpandedId(expanding ? item.id : null)
                      if (expanding && !item.is_read) markAsRead(item.id)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {expandedId === item.id
                      ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    }
                    <span className="truncate text-sm font-medium">{item.title}</span>
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(item.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    title={item.is_pinned ? "Unpin" : "Pin"}
                    onClick={() => item.is_pinned ? unpinItem(item.id) : pinItem(item.id)}
                  >
                    {item.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    title="Open in chat"
                    onClick={() => handleOpen(item)}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {expandedId === item.id && (
                  <div className="border-t px-3 py-3">
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground scrollbar-thumb-only">
                      {item.content}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
