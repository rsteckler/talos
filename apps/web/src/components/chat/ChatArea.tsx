import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useOrb } from "@/contexts/OrbContext"
import { Moon, Circle, Zap, Shuffle } from "lucide-react"

export function ChatArea() {
  const orbRef = useOrb()

  return (
    <div className="flex h-full flex-col bg-black">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 px-4 bg-zinc-950/50">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <span className="font-semibold text-zinc-100">Chat</span>
      </header>
      <div className="flex flex-1 flex-col">
        <div className="relative flex-1 overflow-auto p-4">
          {/* Chat messages will go here */}
          <div className="flex h-full items-center justify-center text-zinc-500">
            {/* Placeholder */}
          </div>

          {/* Orb control buttons */}
          <div className="absolute bottom-6 right-6 flex gap-2">
            <button
              onClick={() => orbRef.current?.sleep()}
              className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm transition-colors hover:bg-zinc-700/80"
            >
              <Moon className="size-4" />
              Sleep
            </button>
            <button
              onClick={() => orbRef.current?.idle()}
              className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm transition-colors hover:bg-zinc-700/80"
            >
              <Circle className="size-4" />
              Idle
            </button>
            <button
              onClick={() => orbRef.current?.turbo()}
              className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm transition-colors hover:bg-zinc-700/80"
            >
              <Zap className="size-4" />
              Turbo
            </button>
            <button
              onClick={() => orbRef.current?.randomize()}
              className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm transition-colors hover:bg-zinc-700/80"
            >
              <Shuffle className="size-4" />
              Randomize
            </button>
          </div>
        </div>
        <div className="border-t border-zinc-800 p-4 bg-zinc-950/50">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Message Talos..."
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 ring-offset-background placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            />
            <button className="inline-flex h-10 items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white ring-offset-background transition-colors hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
