import { useState, useRef, useEffect, useCallback } from "react"
import { Inbox, Bell, ClipboardCheck, Calendar, Loader2, ExternalLink } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar"
import { FlowHistoryDialog } from "@/components/flow/FlowHistoryDialog"
import { useChatStore, useInboxStore } from "@/stores"
import type { InboxItem } from "@talos/shared/types"

function typeIcon(type: InboxItem["type"]) {
  switch (type) {
    case "task_result":
      return <ClipboardCheck className="size-4 shrink-0" />
    case "schedule_result":
      return <Calendar className="size-4 shrink-0" />
    case "notification":
      return <Bell className="size-4 shrink-0" />
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

export function FlowSection() {
  const { state } = useSidebar()
  const items = useInboxStore((s) => s.items)
  const unreadCount = useInboxStore((s) => s.unreadCount)
  const isLoading = useInboxStore((s) => s.isLoading)
  const hasMore = useInboxStore((s) => s.hasMore)
  const isFetchingMore = useInboxStore((s) => s.isFetchingMore)
  const fetchMore = useInboxStore((s) => s.fetchMore)
  const markAsRead = useInboxStore((s) => s.markAsRead)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const setInboxContext = useChatStore((s) => s.setInboxContext)
  const [historyOpen, setHistoryOpen] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)

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

    // Use the SidebarContent scrollable parent as root
    const scrollParent = sentinel.closest('[data-sidebar="content"]')
    const observer = new IntersectionObserver(observerCallback, {
      root: scrollParent as Element | null,
      rootMargin: "100px",
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [observerCallback])

  if (state === "collapsed") {
    return (
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Flow">
              <Inbox />
              {unreadCount > 0 && (
                <SidebarMenuBadge className="bg-cyan-500 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
                  {unreadCount}
                </SidebarMenuBadge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    )
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="flex w-full items-center">
          <Inbox className="mr-2 size-4" />
          <span>Flow</span>
          {unreadCount > 0 && (
            <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              className="p-0.5 rounded hover:bg-muted"
              title="Flow History"
              onClick={() => setHistoryOpen(true)}
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {isLoading && items.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-muted-foreground">Loading...</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : items.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <span className="text-muted-foreground">Inbox empty</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => {
                      if (!item.is_read) markAsRead(item.id)
                      setActiveConversation(null)
                      clearMessages()
                      setInboxContext(item)
                    }}
                    className="h-auto py-2"
                  >
                    <div className="flex w-full items-start gap-2">
                      {!item.is_read && (
                        <span className="mt-1.5 block size-2 shrink-0 rounded-full bg-cyan-400" />
                      )}
                      {item.is_read && <span className="mt-1.5 block size-2 shrink-0" />}
                      {typeIcon(item.type)}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-normal text-zinc-200">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {relativeTime(item.created_at)}
                        </span>
                      </div>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
            {isFetchingMore && (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-muted-foreground">Loading more...</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
          {/* Sentinel for infinite scroll */}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
        </SidebarGroupContent>
      </SidebarGroup>
      <FlowHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  )
}
