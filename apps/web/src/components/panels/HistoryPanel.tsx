import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Loader2, MessageSquare, ExternalLink } from "lucide-react"
import { ChatHistoryDialog } from "@/components/chat/ChatHistoryDialog"
import { conversationsApi } from "@/api/conversations"
import { useChatStore, useLayoutStore } from "@/stores"
import type { ConversationSummary } from "@talos/shared/types"

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

const PAGE_SIZE = 20

export function HistoryPanel() {
  const loadConversation = useChatStore((s) => s.loadConversation)
  const setSlidePanel = useLayoutStore((s) => s.setSlidePanel)

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const hasMore = conversations.length < total
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchPage = useCallback(async (pageNum: number, search: string, replace: boolean) => {
    setIsLoading(true)
    try {
      const result = await conversationsApi.search({
        search: search || undefined,
        page: pageNum,
        limit: PAGE_SIZE,
      })
      setConversations((prev) =>
        replace ? result.conversations : [...prev, ...result.conversations]
      )
      setTotal(result.total)
      setPage(pageNum)
    } catch (err) {
      console.error("[HistoryPanel] Failed to fetch:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setConversations([])
    setPage(1)
    setTotal(0)
    fetchPage(1, debouncedSearch, true)
  }, [debouncedSearch, fetchPage])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && hasMore && !isLoading) {
          fetchPage(page + 1, debouncedSearch, false)
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, page, debouncedSearch, fetchPage])

  const handleSelect = (id: string) => {
    loadConversation(id)
    setSlidePanel(null)
  }

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div ref={scrollContainerRef} className="flex flex-col">
      {/* Stats bar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/60 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span> conversations
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Open in modal"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      {conversations.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare className="mb-2 size-6" />
          <p className="text-xs">
            {debouncedSearch ? "No conversations found" : "No conversations yet"}
          </p>
        </div>
      )}

      <div className="space-y-0.5 px-2 pb-2">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => handleSelect(conv.id)}
            className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{conv.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {relativeTime(conv.updated_at)}
              </span>
            </div>
            {conv.snippet && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {conv.snippet}
              </p>
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />

      <ChatHistoryDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
