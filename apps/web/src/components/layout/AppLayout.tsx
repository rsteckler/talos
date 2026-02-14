import { X } from "lucide-react"
import { NavRail } from "@/components/layout/NavRail"
import { FlowFeed } from "@/components/flow/FlowFeed"
import { TasksPanel } from "@/components/panels/TasksPanel"
import { HistoryPanel } from "@/components/panels/HistoryPanel"
import { ChatArea } from "@/components/chat/ChatArea"
import { useLayoutStore } from "@/stores"

const TITLES: Record<string, string> = {
  flow: "Flow",
  tasks: "Tasks",
  history: "Chat History",
}

export function AppLayout() {
  const slidePanel = useLayoutStore((s) => s.slidePanel)
  const setSlidePanel = useLayoutStore((s) => s.setSlidePanel)

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <NavRail />

      {/* Left slide-out panel */}
      <div
        className={`shrink-0 overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-out ${
          slidePanel ? "w-80" : "w-0"
        }`}
      >
        {slidePanel && (
          <div className="flex h-full w-80 flex-col">
            <div className="relative flex shrink-0 items-center border-b border-border px-4 py-3">
              <h2 className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
                {TITLES[slidePanel]}
              </h2>
              <div className="ml-auto">
                <button
                  onClick={() => setSlidePanel(null)}
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thumb-only">
              {slidePanel === "flow" && <FlowFeed />}
              {slidePanel === "tasks" && <TasksPanel />}
              {slidePanel === "history" && <HistoryPanel />}
            </div>
          </div>
        )}
      </div>

      {/* Chat — always visible */}
      <main className="relative flex min-w-0 flex-1">
        <ChatArea />
      </main>
    </div>
  )
}
