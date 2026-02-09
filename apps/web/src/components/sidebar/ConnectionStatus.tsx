import { Wifi, WifiOff, Loader2 } from "lucide-react"
import { useConnectionStore } from "@/stores"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

export function ConnectionStatus() {
  const status = useConnectionStore((s) => s.status)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={
            status === "connected"
              ? "Connected"
              : status === "reconnecting"
                ? "Reconnecting…"
                : "Disconnected"
          }
          className="cursor-default"
        >
          {status === "connected" && (
            <>
              <Wifi className="size-4 text-emerald-400" />
              <span className="text-xs text-emerald-400">Connected</span>
            </>
          )}
          {status === "reconnecting" && (
            <>
              <Loader2 className="size-4 animate-spin text-amber-400" />
              <span className="text-xs text-amber-400">Reconnecting…</span>
            </>
          )}
          {status === "disconnected" && (
            <>
              <WifiOff className="size-4 text-red-400" />
              <span className="text-xs text-red-400">Disconnected</span>
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
