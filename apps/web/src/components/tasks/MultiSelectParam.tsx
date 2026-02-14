import { useCallback, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { toolsApi } from "@/api/tools"
import type { TriggerParamSpec } from "@talos/shared/types"
import { ChevronRight, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
  group?: string
}

interface MultiSelectParamProps {
  param: TriggerParamSpec
  toolId: string
  selected: string[]
  onChange: (values: string[]) => void
  className?: string
}

/** Resolve a dot-path like "entities.entity_id" against a data object. */
function resolvePath(data: unknown, path: string): unknown[] {
  const parts = path.split(".")
  if (parts.length < 2) return []

  const arrayKey = parts[0]!
  const fieldKey = parts.slice(1).join(".")

  const arr = (data as Record<string, unknown>)?.[arrayKey]
  if (!Array.isArray(arr)) return []

  return arr.map((item) => {
    const rec = item as Record<string, unknown>
    return rec[fieldKey]
  })
}

export function MultiSelectParam({ param, toolId, selected, onChange, className }: MultiSelectParamProps) {
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [fetchCount, setFetchCount] = useState(0)

  const fetchOptions = useCallback(() => {
    if (!param.source) return

    setLoading(true)
    setError(null)

    toolsApi
      .callFunction(toolId, param.source.function, param.source.args)
      .then((data) => {
        const values = resolvePath(data, param.source!.valuePath)
        const labels = resolvePath(data, param.source!.labelPath)
        const groups = param.source!.groupPath
          ? resolvePath(data, param.source!.groupPath)
          : []

        const opts: Option[] = []
        for (let i = 0; i < values.length; i++) {
          const v = values[i]
          if (typeof v !== "string") continue
          opts.push({
            value: v,
            label: (labels[i] as string) ?? v,
            group: (groups[i] as string) ?? undefined,
          })
        }

        opts.sort((a, b) => {
          if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group)
          return a.label.localeCompare(b.label)
        })

        setOptions(opts)

        // Auto-expand groups that have selected items
        if (param.source!.groupPath) {
          const groupsWithSelected = new Set<string>()
          for (const opt of opts) {
            if (opt.group && selected.includes(opt.value)) {
              groupsWithSelected.add(opt.group)
            }
          }
          if (groupsWithSelected.size > 0) {
            setExpandedGroups(groupsWithSelected)
          }
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load options")
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, param.source?.function])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions, fetchCount])

  const filteredOptions = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [options, search])

  const grouped = useMemo(() => {
    if (!param.source?.groupPath) return null
    const map = new Map<string, Option[]>()
    for (const opt of filteredOptions) {
      const g = opt.group ?? "Other"
      const arr = map.get(g)
      if (arr) {
        arr.push(opt)
      } else {
        map.set(g, [opt])
      }
    }
    return map
  }, [filteredOptions, param.source?.groupPath])

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Loading options...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive flex items-center justify-between gap-2">
        <span>{error}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-destructive hover:text-destructive"
          onClick={() => setFetchCount((c) => c + 1)}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        {selected.length > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {selected.length} selected
          </Badge>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={loading}
          onClick={() => setFetchCount((c) => c + 1)}
          title="Refresh entity list"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className={cn("h-[280px] rounded-md border", className)}>
        <div className="p-2">
          {filteredOptions.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {search ? "No matches found." : "No options available."}
            </p>
          )}

          {grouped ? (
            Array.from(grouped.entries()).map(([group, opts]) => {
              const selectedInGroup = opts.filter((o) => selected.includes(o.value)).length
              return (
                <Collapsible
                  key={group}
                  open={expandedGroups.has(group)}
                  onOpenChange={() => toggleGroup(group)}
                >
                  <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                    <ChevronRight className={cn(
                      "h-3 w-3 transition-transform",
                      expandedGroups.has(group) && "rotate-90",
                    )} />
                    <span>{group}</span>
                    <span className="ml-auto tabular-nums">
                      {selectedInGroup > 0 && (
                        <Badge variant="secondary" className="mr-1 px-1.5 py-0 text-[10px]">
                          {selectedInGroup}
                        </Badge>
                      )}
                      ({opts.length})
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3">
                      {opts.map((opt) => (
                        <OptionRow
                          key={opt.value}
                          option={opt}
                          checked={selected.includes(opt.value)}
                          onToggle={() => toggle(opt.value)}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })
          ) : (
            filteredOptions.map((opt) => (
              <OptionRow
                key={opt.value}
                option={opt}
                checked={selected.includes(opt.value)}
                onToggle={() => toggle(opt.value)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function OptionRow({
  option,
  checked,
  onToggle,
}: {
  option: Option
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-input accent-primary"
      />
      <span className="truncate">{option.label}</span>
      {option.label !== option.value && (
        <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">
          {option.value}
        </span>
      )}
    </label>
  )
}
