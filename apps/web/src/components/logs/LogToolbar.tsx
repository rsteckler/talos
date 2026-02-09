import { useCallback } from "react"
import { Search, Radio } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLogStore } from "@/stores"

interface LogToolbarProps {
  streaming: boolean
  onToggleStreaming: () => void
}

export function LogToolbar({ streaming, onToggleStreaming }: LogToolbarProps) {
  const filters = useLogStore((s) => s.filters)
  const setFilter = useLogStore((s) => s.setFilter)
  const areas = useLogStore((s) => s.areas)

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilter({ search: e.target.value })
    },
    [setFilter]
  )

  const handleAreaChange = useCallback(
    (value: string) => {
      if (value === "all") {
        setFilter({ areas: [] })
      } else {
        setFilter({ areas: [value] })
      }
    },
    [setFilter]
  )

  const handleLevelChange = useCallback(
    (value: string) => {
      setFilter({ level: value === "all" ? undefined : value })
    },
    [setFilter]
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search logs..."
          value={filters.search}
          onChange={handleSearchChange}
          className="pl-9 w-full sm:w-48"
        />
      </div>

      <Select
        value={filters.areas.length === 1 ? filters.areas[0] : "all"}
        onValueChange={handleAreaChange}
      >
        <SelectTrigger className="w-full sm:w-32">
          <SelectValue placeholder="Area" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All areas</SelectItem>
          {areas.map((area) => (
            <SelectItem key={area} value={area}>
              {area}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.level ?? "all"}
        onValueChange={handleLevelChange}
      >
        <SelectTrigger className="w-full sm:w-28">
          <SelectValue placeholder="Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All levels</SelectItem>
          <SelectItem value="error">error</SelectItem>
          <SelectItem value="warn">warn</SelectItem>
          <SelectItem value="info">info</SelectItem>
          <SelectItem value="high">high</SelectItem>
          <SelectItem value="medium">medium</SelectItem>
          <SelectItem value="low">low</SelectItem>
          <SelectItem value="debug">debug</SelectItem>
          <SelectItem value="verbose">verbose</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant={streaming ? "default" : "outline"}
        size="sm"
        onClick={onToggleStreaming}
        className="gap-1.5"
      >
        <Radio className="size-3.5" />
        {streaming ? "Live" : "Paused"}
      </Button>
    </div>
  )
}
