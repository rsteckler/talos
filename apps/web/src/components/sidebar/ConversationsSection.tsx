import { useState } from "react"
import { ChevronRight, MessageSquare, Plus, Trash2, History } from "lucide-react"
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
  SidebarMenuAction,
  useSidebar,
} from "@/components/ui/sidebar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ChatHistoryDialog } from "@/components/chat/ChatHistoryDialog"
import { useChatStore } from "@/stores"

const SIDEBAR_CONVERSATION_LIMIT = 3

export function ConversationsSection() {
  const { state } = useSidebar()
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const loadConversation = useChatStore((s) => s.loadConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)

  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const visibleConversations = conversations.slice(0, SIDEBAR_CONVERSATION_LIMIT)

  const handleNewChat = () => {
    setActiveConversation(null)
    clearMessages()
  }

  if (state === "collapsed") {
    return (
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Conversations" onClick={handleNewChat}>
              <MessageSquare />
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
            <MessageSquare className="mr-2 size-4" />
            <span>Conversations</span>
            <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleNewChat}>
                  <Plus className="size-4" />
                  <span>New Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {visibleConversations.map((conv) => (
                <SidebarMenuItem key={conv.id}>
                  <SidebarMenuButton
                    isActive={conv.id === activeConversationId}
                    onClick={() => loadConversation(conv.id)}
                    className="truncate"
                  >
                    <span className="truncate">{conv.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingConvId(conv.id)
                    }}
                    className="opacity-0 group-hover/menu-item:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
              {conversations.length > SIDEBAR_CONVERSATION_LIMIT && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setHistoryOpen(true)}
                    className="text-muted-foreground"
                  >
                    <History className="size-4" />
                    <span>See all chats</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {conversations.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <span className="text-muted-foreground">No conversations yet</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
    <ConfirmDialog
      open={deletingConvId !== null}
      onOpenChange={(open) => { if (!open) setDeletingConvId(null) }}
      title="Delete Conversation"
      description="Delete this conversation? This cannot be undone."
      onConfirm={() => {
        if (deletingConvId) deleteConversation(deletingConvId)
      }}
    />
    <ChatHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
  </>
  )
}
