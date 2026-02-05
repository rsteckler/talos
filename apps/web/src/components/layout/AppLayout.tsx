import { SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { ChatArea } from "@/components/chat/ChatArea"

export function AppLayout() {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <ChatArea />
      </SidebarInset>
    </>
  )
}
