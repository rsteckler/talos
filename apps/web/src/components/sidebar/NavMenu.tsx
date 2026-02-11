import { useState } from "react"
import { Link } from "react-router-dom"
import { Settings, ScrollText, History } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
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
  const [historyOpen, setHistoryOpen] = useState(false)

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
