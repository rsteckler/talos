import { Link } from "react-router-dom"
import { MessageSquare, Wrench, Settings } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { ConnectionStatus } from "@/components/sidebar/ConnectionStatus"

const navItems = [
  {
    title: "Chat History",
    icon: MessageSquare,
  },
  {
    title: "Tools",
    icon: Wrench,
  },
  {
    title: "Settings",
    icon: Settings,
    to: "/settings",
  },
]

export function NavMenu() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
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
        <ConnectionStatus />
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
