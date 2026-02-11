import { useState } from "react"
import { ChevronRight, Inbox, Bell, ClipboardCheck, Calendar, Loader2, History } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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

const SIDEBAR_FLOW_LIMIT = 5

export function FlowSection() {
  const { state } = useSidebar()
  const allItems = useInboxStore((s) => s.items)
  const unreadCount = useInboxStore((s) => s.unreadCount)
  const isLoading = useInboxStore((s) => s.isLoading)
  const markAsRead = useInboxStore((s) => s.markAsRead)
  const items = allItems.slice(0, SIDEBAR_FLOW_LIMIT)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const setInboxContext = useChatStore((s) => s.setInboxContext)
  const [historyOpen, setHistoryOpen] = useState(false)

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
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center">
            <Inbox className="mr-2 size-4" />
            <span>Flow</span>
            {unreadCount > 0 && (
              <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
            <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
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
                          <span className="truncate text-xs font-medium text-zinc-200">
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
              {allItems.length > SIDEBAR_FLOW_LIMIT && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setHistoryOpen(true)}
                    className="text-muted-foreground"
                  >
                    <History className="size-4" />
                    <span>See all flows</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
    <FlowHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
  </>
  )
}
