import { useState, useRef, useEffect, useCallback } from "react"
import { Inbox, ClipboardCheck, Calendar, Bell, Loader2, Pin, PinOff, MessageSquare, Trash2, ExternalLink } from "lucide-react"
import { FlowHistoryDialog } from "@/components/flow/FlowHistoryDialog"
import { Markdown } from "@/components/chat/Markdown"
import { useChatStore, useInboxStore, useLayoutStore } from "@/stores"
import type { InboxItem } from "@talos/shared/types"

function typeIcon(type: InboxItem["type"]) {
  switch (type) {
    case "task_result":
      return <ClipboardCheck className="size-4 shrink-0 text-[var(--orb-primary)]" />
    case "schedule_result":
      return <Calendar className="size-4 shrink-0 text-[var(--orb-primary)]" />
    case "notification":
      return <Bell className="size-4 shrink-0 text-[var(--orb-primary)]" />
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

function FlowItemCard({
  item,
  isExpanded,
  onToggle,
  onChatAbout,
  onPin,
  onDelete,
}: {
  item: InboxItem
  isExpanded: boolean
  onToggle: () => void
  onChatAbout: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const isPinned = item.is_pinned
  const isUnread = !item.is_read

  return (
    <div
      className={`rounded-xl border bg-card transition-all duration-200 ${
        isUnread ? "border-l-2 border-l-[var(--orb-primary)] border-border" : "border-border"
      } ${isExpanded ? "shadow-sm" : ""}`}
    >
      {/* Collapsed row */}
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        {typeIcon(item.type)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm ${isUnread ? "font-semibold" : "font-medium"} text-foreground`}>
              {item.title}
            </span>
          </div>
          {item.summary && !isExpanded && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.summary}</p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {relativeTime(item.created_at)}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/50 px-3 py-2.5">
          <div className="prose-chat max-h-60 overflow-auto text-sm text-foreground scrollbar-thumb-only">
            <Markdown>{item.content}</Markdown>
          </div>
          {/* Action bar */}
          <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2">
            <button
              onClick={onPin}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {isPinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={onChatAbout}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageSquare className="size-3.5" />
              Chat
            </button>
            <div className="flex-1" />
            <button
              onClick={onDelete}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function FlowFeed() {
  const items = useInboxStore((s) => s.items)
  const isLoading = useInboxStore((s) => s.isLoading)
  const hasMore = useInboxStore((s) => s.hasMore)
  const isFetchingMore = useInboxStore((s) => s.isFetchingMore)
  const fetchMore = useInboxStore((s) => s.fetchMore)
  const markAsRead = useInboxStore((s) => s.markAsRead)
  const pinItem = useInboxStore((s) => s.pinItem)
  const unpinItem = useInboxStore((s) => s.unpinItem)
  const removeItem = useInboxStore((s) => s.removeItem)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const setInboxContext = useChatStore((s) => s.setInboxContext)
  const setSlidePanel = useLayoutStore((s) => s.setSlidePanel)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // IntersectionObserver for infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0]
      if (entry?.isIntersecting) {
        fetchMore()
      }
    },
    [fetchMore],
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(observerCallback, {
      root: scrollContainerRef.current,
      rootMargin: "100px",
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [observerCallback])

  const handleToggle = (item: InboxItem) => {
    const expanding = expandedId !== item.id
    setExpandedId(expanding ? item.id : null)
    if (expanding && !item.is_read) {
      markAsRead(item.id)
    }
  }

  const handleChatAbout = (item: InboxItem) => {
    if (!item.is_read) markAsRead(item.id)
    setActiveConversation(null)
    clearMessages()
    setInboxContext(item)
    setSlidePanel(null)
  }

  const handlePin = (item: InboxItem) => {
    if (item.is_pinned) {
      unpinItem(item.id)
    } else {
      pinItem(item.id)
    }
  }

  const handleDelete = (id: string) => {
    if (expandedId === id) setExpandedId(null)
    removeItem(id)
  }

  const pinned = items.filter((i) => i.is_pinned)
  const unread = items.filter((i) => !i.is_read && !i.is_pinned)
  const read = items.filter((i) => i.is_read && !i.is_pinned)
  const isEmpty = items.length === 0

  return (
    <div ref={scrollContainerRef} className="flex flex-col">
      {/* Stats bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/60 px-3 py-1.5 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {unread.length > 0 && (
            <span><span className="font-semibold text-foreground">{unread.length}</span> unread</span>
          )}
          {pinned.length > 0 && (
            <span><span className="font-semibold text-foreground">{pinned.length}</span> pinned</span>
          )}
          <span><span className="font-semibold text-foreground">{items.length}</span> total</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setHistoryOpen(true)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Flow History"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      {isLoading && isEmpty ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Inbox className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No flow items yet</p>
          <p className="max-w-[240px] text-center text-xs text-muted-foreground/70">
            Tasks run on schedule and results appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 px-3 pb-3">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <>
              <div className="px-1 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Pinned
              </div>
              {pinned.map((item) => (
                <FlowItemCard
                  key={item.id}
                  item={item}
                  isExpanded={expandedId === item.id}
                  onToggle={() => handleToggle(item)}
                  onChatAbout={() => handleChatAbout(item)}
                  onPin={() => handlePin(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </>
          )}

          {/* Unread section */}
          {unread.length > 0 && (
            <>
              <div className="px-1 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Unread
              </div>
              {unread.map((item) => (
                <FlowItemCard
                  key={item.id}
                  item={item}
                  isExpanded={expandedId === item.id}
                  onToggle={() => handleToggle(item)}
                  onChatAbout={() => handleChatAbout(item)}
                  onPin={() => handlePin(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </>
          )}

          {/* Read section */}
          {read.length > 0 && (
            <>
              <div className="px-1 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Recent
              </div>
              {read.map((item) => (
                <FlowItemCard
                  key={item.id}
                  item={item}
                  isExpanded={expandedId === item.id}
                  onToggle={() => handleToggle(item)}
                  onChatAbout={() => handleChatAbout(item)}
                  onPin={() => handlePin(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </>
          )}

          {/* Infinite scroll sentinel */}
          {isFetchingMore && (
            <div className="flex justify-center py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
        </div>
      )}

      <FlowHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
