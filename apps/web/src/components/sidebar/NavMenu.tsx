import { useState } from "react"
import { Link } from "react-router-dom"
import { Settings, ScrollText, History } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChatHistoryDialog } from "@/components/chat/ChatHistoryDialog"

const navItems = [
  {
    title: "Logs",
    icon: ScrollText,
    to: "/logs",
  },
  {
    title: "Settings",
    icon: Settings,
    to: "/settings",
  },
]

export function NavMenu() {
  const { state } = useSidebar()
  const [historyOpen, setHistoryOpen] = useState(false)

  if (state === "collapsed") {
    return (
      <>
        <div className="flex flex-col items-center gap-1 p-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent"
            title="Chat History"
          >
            <History className="size-4" />
          </button>
          <Link
            to="/logs"
            className="flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent"
            title="Logs"
          >
            <ScrollText className="size-4" />
          </Link>
          <Link
            to="/settings"
            className="flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent"
            title="Settings"
          >
            <Settings className="size-4" />
          </Link>
        </div>
        <ChatHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      </>
    )
  }

  return (
    <>
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Chat History" onClick={() => setHistoryOpen(true)}>
              <History />
              <span>Chat History</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.to ? (
                <SidebarMenuButton tooltip={item.title} asChild>
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton tooltip={item.title}>
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
    <ChatHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  )
}
