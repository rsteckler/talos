import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { TalosOrb } from "@/components/sidebar/TalosOrb"
import { NavMenu } from "@/components/sidebar/NavMenu"
import { ConversationsSection } from "@/components/sidebar/ConversationsSection"
import { TasksSection } from "@/components/sidebar/TasksSection"
import { FlowSection } from "@/components/sidebar/FlowSection"

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <TalosOrb />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <ConversationsSection />
        <SidebarSeparator />
        <TasksSection />
        <SidebarSeparator />
        <FlowSection />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <NavMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
