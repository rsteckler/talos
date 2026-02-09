import { useEffect, useRef } from "react"
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"
import { TalosOrb as AnimatedOrb } from "@/components/orb/TalosOrb"
import { useOrb } from "@/contexts/OrbContext"
import { useConnectionStore } from "@/stores"
import type { AgentStatus } from "@talos/shared/types"

const sidebarOrbConfig = {
  size: 200,
  ringCount: 2,
  cometCount: 2,
  sparkliness: 0.3,
  blobiness: 0.1,
  animationScale: 0.3,
}

export function TalosOrb() {
  const orbRef = useOrb()
  const agentStatus = useConnectionStore((s) => s.agentStatus)
  const prevStatusRef = useRef<AgentStatus>("idle")

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
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip="Talos" className="hover:bg-transparent active:bg-transparent">
          {/* Container has fixed size for layout, but overflow visible lets orb render outside */}
          <div
            className="relative flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              overflow: 'visible',
            }}
          >
            {/* Orb is absolutely positioned and centered, renders outside container bounds */}
            <div
              className="absolute"
              style={{
                transform: 'translate(-50%, -50%)',
                left: '50%',
                top: '50%',
              }}
            >
              <AnimatedOrb ref={orbRef} initialConfig={sidebarOrbConfig} initialState="sleep" />
            </div>
          </div>
          <div className="ml-auto flex flex-col gap-0.5 leading-none text-right">
            <span className="font-semibold">Talos</span>
            <span className="text-xs text-muted-foreground">AI Chief of Staff</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
