import { useEffect, useState } from "react"
import { Settings2, Loader2, Bell, BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useChannelStore } from "@/stores/useChannelStore"
import { ChannelConfigDialog } from "./ChannelConfigDialog"
import type { ChannelInfo } from "@talos/shared/types"

export function ChannelList() {
  const { channels, loading, fetchChannels, enableChannel, disableChannel, setNotifications } = useChannelStore()
  const [configChannel, setConfigChannel] = useState<ChannelInfo | null>(null)

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  if (loading && channels.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading channels...
      </div>
    )
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No channels found. Add channels to the <code>channels/</code> directory.
      </p>
    )
  }

  const handleToggle = async (channel: ChannelInfo) => {
    if (channel.isEnabled) {
      await disableChannel(channel.id)
    } else {
      await enableChannel(channel.id)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {channels.map((channel) => (
          <div
            key={channel.id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3"
          >
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{channel.name}</span>
                <span className="text-xs text-muted-foreground">v{channel.version}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {channel.description}
              </p>
              {channel.credentials.length > 0 && !channel.hasRequiredCredentials && (
                <p className="text-xs text-amber-500 mt-0.5">
                  Credentials required
                </p>
              )}
              {channel.isEnabled && (
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                  <Switch
                    checked={channel.notificationsEnabled}
                    onCheckedChange={(checked) => setNotifications(channel.id, checked)}
                    className="scale-75 origin-left"
                  />
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {channel.notificationsEnabled ? (
                      <Bell className="size-3" />
                    ) : (
                      <BellOff className="size-3" />
                    )}
                    Push notifications
                  </span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {channel.credentials.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setConfigChannel(channel)}
                >
                  <Settings2 className="size-4" />
                  <span className="sr-only">Configure {channel.name}</span>
                </Button>
              )}
              <Switch
                checked={channel.isEnabled}
                onCheckedChange={() => handleToggle(channel)}
              />
            </div>
          </div>
        ))}
      </div>

      <ChannelConfigDialog
        channel={configChannel}
        onClose={() => setConfigChannel(null)}
      />
    </>
  )
}
