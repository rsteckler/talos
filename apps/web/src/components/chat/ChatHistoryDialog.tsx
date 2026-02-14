import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Loader2, MessageSquare, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { conversationsApi } from "@/api/conversations"
import { useChatStore } from "@/stores"
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

interface ChatHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAGE_SIZE = 20

export function ChatHistoryDialog({ open, onOpenChange }: ChatHistoryDialogProps) {
  const loadConversation = useChatStore((s) => s.loadConversation)

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const hasMore = conversations.length < total
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset and fetch when search changes or dialog opens
  useEffect(() => {
    if (!open) return
    setConversations([])
    setPage(1)
    setTotal(0)
    fetchPage(1, debouncedSearch, true)
  }, [debouncedSearch, open])

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
      console.error("[ChatHistory] Failed to fetch:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!open) return
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
  }, [open, hasMore, isLoading, page, debouncedSearch, fetchPage])

  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)

  const handleSelect = (id: string) => {
    loadConversation(id)
    onOpenChange(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await conversationsApi.remove(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      setTotal((prev) => prev - 1)
      if (activeConversationId === id) {
        setActiveConversation(null)
        clearMessages()
      }
    } catch (err) {
      console.error("[ChatHistory] Failed to delete:", err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Chat History</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto scrollbar-thumb-only px-6 pb-6 min-h-0"
        >
          {conversations.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="size-8 mb-2" />
              <p className="text-sm">
                {debouncedSearch ? "No conversations found" : "No conversations yet"}
              </p>
            </div>
          )}

          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="group/row flex items-center gap-1 rounded-lg hover:bg-accent transition-colors"
              >
                <button
                  onClick={() => handleSelect(conv.id)}
                  className="flex-1 min-w-0 text-left px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{conv.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(conv.updated_at)}
                    </span>
                  </div>
                  {conv.snippet && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {conv.snippet}
                    </p>
                  )}
                </button>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="hidden shrink-0 rounded-lg p-1.5 mr-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/row:block"
                  title="Delete conversation"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
