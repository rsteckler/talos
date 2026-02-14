import { useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { Inbox, ListTodo, History, ScrollText, Settings } from "lucide-react"
import { TalosOrb as AnimatedOrb } from "@/components/orb/TalosOrb"
import { useOrb } from "@/contexts/OrbContext"
import { useLayoutStore, useInboxStore, useConnectionStore } from "@/stores"
import type { AgentStatus } from "@talos/shared/types"

function NavButton({
  icon: Icon,
  label,
  isActive,
  badge,
  onClick,
}: {
  icon: typeof Inbox
  label: string
  isActive?: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative flex size-10 items-center justify-center rounded-lg transition-colors ${
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="size-5" />
      {badge != null && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--orb-primary)] px-1 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

function NavLink({
  icon: Icon,
  label,
  to,
}: {
  icon: typeof Inbox
  label: string
  to: string
}) {
  return (
    <Link
      to={to}
      title={label}
      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-5" />
    </Link>
  )
}

const navOrbConfig = {
  size: 200,
  ringCount: 2,
  cometCount: 2,
  sparkliness: 0.3,
  blobiness: 0.1,
  animationScale: 0.3,
}

export function NavRail() {
  const orbRef = useOrb()
  const slidePanel = useLayoutStore((s) => s.slidePanel)
  const toggleSlidePanel = useLayoutStore((s) => s.toggleSlidePanel)
  const unreadCount = useInboxStore((s) => s.unreadCount)
  const agentStatus = useConnectionStore((s) => s.agentStatus)
  const prevStatusRef = useRef<AgentStatus>("idle")

  // Sync orb animation state with agent status
  useEffect(() => {
    const orb = orbRef.current
    if (!orb || agentStatus === prevStatusRef.current) return
    prevStatusRef.current = agentStatus

    switch (agentStatus) {
      case "idle":
        orb.sleep()
        break
      case "thinking":
      case "responding":
      case "tool_calling":
        orb.idle()
        break
    }
  }, [agentStatus, orbRef])

  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center border-r border-border bg-card py-3">
      {/* Orb */}
      <div
        className="pointer-events-none relative mb-14 flex items-center justify-center"
        style={{ width: 32, height: 32, overflow: "visible" }}
      >
        <div
          className="absolute"
          style={{ transform: "translate(-50%, -50%)", left: "50%", top: "50%" }}
        >
          <AnimatedOrb ref={orbRef} initialConfig={navOrbConfig} initialState="sleep" />
        </div>
      </div>

      {/* Primary nav */}
      <div className="flex flex-col items-center gap-1">
        <NavButton
          icon={Inbox}
          label="Flow"
          isActive={slidePanel === "flow"}
          badge={unreadCount}
          onClick={() => toggleSlidePanel("flow")}
        />
        <NavButton
          icon={ListTodo}
          label="Tasks"
          isActive={slidePanel === "tasks"}
          onClick={() => toggleSlidePanel("tasks")}
        />
        <NavButton
          icon={History}
          label="History"
          isActive={slidePanel === "history"}
          onClick={() => toggleSlidePanel("history")}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1">
        <NavLink icon={ScrollText} label="Logs" to="/logs" />
        <NavLink icon={Settings} label="Settings" to="/settings" />
      </div>
    </nav>
  )
}
