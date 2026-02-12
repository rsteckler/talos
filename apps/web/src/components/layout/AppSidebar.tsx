import { useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { NavMenu } from "@/components/sidebar/NavMenu"
import { TasksSection } from "@/components/sidebar/TasksSection"
import { FlowSection } from "@/components/sidebar/FlowSection"

const cardClasses =
  "rounded-lg border border-sidebar-border bg-sidebar shadow"

function CollapseHandle() {
  const { toggleSidebar, state } = useSidebar()

  return (
    <button
      onClick={toggleSidebar}
      aria-label="Toggle Sidebar"
      className="absolute -right-[19px] top-1/2 z-20 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-sidebar-border bg-sidebar shadow-sm transition-colors hover:bg-sidebar-accent"
    >
      {state === "expanded" ? (
        <ChevronLeft className="size-3" />
      ) : (
        <ChevronRight className="size-3" />
      )}
    </button>
  )
}

function UserPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className={cardClasses}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent rounded-lg"
      >
        <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
          R
        </div>
        <span className="font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden">Ryan</span>
        <ChevronUp className={`ml-auto size-4 text-muted-foreground transition-transform duration-200 group-data-[collapsible=icon]:hidden ${open ? "" : "rotate-180"}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <SidebarFooter>
            <NavMenu />
          </SidebarFooter>
        </div>
      </div>
    </div>
  )
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="floating">
      <CollapseHandle />
      <div className={cardClasses}>
        <TasksSection />
      </div>
      <div className={`${cardClasses} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <SidebarContent className="scrollbar-thumb-only">
          <FlowSection />
        </SidebarContent>
      </div>
      <UserPanel />
    </Sidebar>
  )
}
