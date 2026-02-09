import { useCallback } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLogStore } from "@/stores"
import type { UserLogLevel, DevLogLevel } from "@talos/shared/types"

const USER_LEVELS: UserLogLevel[] = ["silent", "low", "medium", "high"]
const DEV_LEVELS: DevLogLevel[] = ["silent", "debug", "verbose"]

export function LogConfigPanel() {
  const configs = useLogStore((s) => s.configs)
  const areas = useLogStore((s) => s.areas)
  const updateConfig = useLogStore((s) => s.updateConfig)

  const getConfig = useCallback(
    (area: string) => {
      const found = configs.find((c) => c.area === area)
      return found ?? { userLevel: "low" as UserLogLevel, devLevel: "silent" as DevLogLevel }
    },
    [configs]
  )

  const handleUserChange = useCallback(
    (area: string, value: string) => {
      const current = getConfig(area)
      updateConfig(area, value as UserLogLevel, current.devLevel)
    },
    [getConfig, updateConfig]
  )

  const handleDevChange = useCallback(
    (area: string, value: string) => {
      const current = getConfig(area)
      updateConfig(area, current.userLevel, value as DevLogLevel)
    },
    [getConfig, updateConfig]
  )

  // Show _default first, then all known areas
  const allAreas = ["_default", ...areas.filter((a) => a !== "_default")]

  if (allAreas.length === 0) {
    return <p className="text-sm text-muted-foreground">No logging areas configured.</p>
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_140px_140px] gap-2 text-xs font-medium text-muted-foreground">
        <div>Area</div>
        <div>User Level</div>
        <div>Dev Level</div>
      </div>
      {allAreas.map((area) => {
        const config = getConfig(area)
        return (
          <div key={area} className="grid grid-cols-[1fr_140px_140px] items-center gap-2">
            <span className="text-sm font-mono">
              {area === "_default" ? "Default (fallback)" : area}
            </span>
            <Select
              value={config.userLevel}
              onValueChange={(v) => handleUserChange(area, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={config.devLevel}
              onValueChange={(v) => handleDevChange(area, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEV_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
