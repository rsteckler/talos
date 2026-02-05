import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

export function ChatArea() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <span className="font-semibold">Chat</span>
      </header>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-auto p-4">
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Start a conversation with Talos
          </div>
        </div>
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Message Talos..."
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <button className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
