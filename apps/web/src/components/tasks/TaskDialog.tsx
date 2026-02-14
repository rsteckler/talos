import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useTaskStore } from "@/stores"
import { toolsApi } from "@/api/tools"
import { TriggerParamEditor } from "./TriggerParamEditor"
import type { Task, TriggerType, TriggerTypeInfo } from "@talos/shared/types"

interface TaskDialogProps {
  task: Task | null // null = create mode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskDialog({ task, open, onOpenChange }: TaskDialogProps) {
  const createTask = useTaskStore((s) => s.createTask)
  const updateTask = useTaskStore((s) => s.updateTask)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [triggerType, setTriggerType] = useState<TriggerType>("manual")
  const [cronExpression, setCronExpression] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState("60")
  const [actionPrompt, setActionPrompt] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [triggerTypes, setTriggerTypes] = useState<TriggerTypeInfo[]>([])
  const [triggerParams, setTriggerParams] = useState<Record<string, unknown>>({})

  // Fetch trigger types when dialog opens
  useEffect(() => {
    if (open) {
      toolsApi.getTriggerTypes()
        .then(setTriggerTypes)
        .catch(() => setTriggerTypes([]))
    }
  }, [open])

  const builtinTriggers = triggerTypes.filter((t) => t.category === "builtin")
  const toolTriggers = triggerTypes.filter((t) => t.category === "tool")
  const isToolTrigger = toolTriggers.some((t) => t.id === triggerType)
  const selectedTriggerInfo = triggerTypes.find((t) => t.id === triggerType)
  const currentTriggerParams = selectedTriggerInfo?.params
  const hasComplexTrigger = isToolTrigger
    && currentTriggerParams != null
    && currentTriggerParams.length > 0
    && currentTriggerParams.some((p) => p.type === "multi-select")

  // Reset form when dialog opens or task changes
  useEffect(() => {
    if (open) {
      if (task) {
        setName(task.name)
        setDescription(task.description ?? "")
        setTriggerType(task.trigger_type)
        setActionPrompt(task.action_prompt)
        setIsActive(task.is_active)
        setError(null)

        try {
          const config = JSON.parse(task.trigger_config) as Record<string, unknown>
          if (task.trigger_type === "cron") {
            setCronExpression((config["cron"] as string) ?? "")
          } else if (task.trigger_type === "interval") {
            setIntervalMinutes(String(config["interval_minutes"] ?? "60"))
          }
          // Seed trigger params from stored config (for tool triggers with params)
          setTriggerParams(config)
        } catch {
          setCronExpression("")
          setIntervalMinutes("60")
          setTriggerParams({})
        }
      } else {
        setName("")
        setDescription("")
        setTriggerType("manual")
        setCronExpression("")
        setIntervalMinutes("60")
        setActionPrompt("")
        setIsActive(true)
        setError(null)
        setTriggerParams({})
      }
    }
  }, [open, task])

  function buildTriggerConfig(): string {
    if (triggerType === "cron") {
      return JSON.stringify({ cron: cronExpression })
    }
    if (triggerType === "interval") {
      return JSON.stringify({ interval_minutes: Number(intervalMinutes) || 60 })
    }
    if (isToolTrigger && Object.keys(triggerParams).length > 0) {
      return JSON.stringify(triggerParams)
    }
    return "{}"
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (!actionPrompt.trim()) {
      setError("Action prompt is required")
      return
    }
    if (triggerType === "cron" && !cronExpression.trim()) {
      setError("Cron expression is required")
      return
    }
    if (triggerType === "interval" && (!intervalMinutes || Number(intervalMinutes) <= 0)) {
      setError("Interval must be a positive number")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const triggerConfig = buildTriggerConfig()

      if (task) {
        await updateTask(task.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          action_prompt: actionPrompt.trim(),
          is_active: isActive,
        })
      } else {
        await createTask({
          name: name.trim(),
          description: description.trim() || undefined,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          action_prompt: actionPrompt.trim(),
          is_active: isActive,
        })
      }

      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save task")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-h-[85vh] flex flex-col transition-[max-width] duration-200",
        hasComplexTrigger ? "sm:max-w-2xl" : "max-w-lg",
      )}>
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            {task
              ? "Update this scheduled task."
              : "Create a new scheduled task. Tasks run prompts automatically based on triggers."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto scrollbar-thumb-only flex-1 px-1">
          {/* ── Task Details ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 shrink-0">Task Details</span>
              <Separator />
            </div>
            <div className={cn(
              "gap-3",
              hasComplexTrigger ? "grid grid-cols-2" : "space-y-3",
            )}>
              <div className="space-y-2">
                <Label htmlFor="task-name">Name</Label>
                <Input
                  id="task-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Daily standup summary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Input
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
          </section>

          {/* ── Trigger ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 shrink-0">Trigger</span>
              <Separator />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={triggerType} onValueChange={(v) => {
                setTriggerType(v as TriggerType)
                setTriggerParams({})
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Built-in</SelectLabel>
                    {builtinTriggers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                    {builtinTriggers.length === 0 && (
                      <>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="cron">Cron Schedule</SelectItem>
                        <SelectItem value="interval">Interval</SelectItem>
                        <SelectItem value="webhook">Webhook</SelectItem>
                      </>
                    )}
                  </SelectGroup>
                  {toolTriggers.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Tool Events</SelectLabel>
                      {toolTriggers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>

            {triggerType === "cron" && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3 border-l-2 border-l-primary/20">
                <div className="space-y-2">
                  <Label htmlFor="task-cron">Cron Expression</Label>
                  <Input
                    id="task-cron"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 9 * * 1-5"
                  />
                  <p className="text-xs text-muted-foreground">
                    Standard cron syntax. Example: &quot;0 9 * * 1-5&quot; = weekdays at 9am
                  </p>
                </div>
              </div>
            )}

            {triggerType === "interval" && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3 border-l-2 border-l-primary/20">
                <div className="space-y-2">
                  <Label htmlFor="task-interval">Interval (minutes)</Label>
                  <Input
                    id="task-interval"
                    type="number"
                    min="1"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(e.target.value)}
                    placeholder="60"
                  />
                </div>
              </div>
            )}

            {triggerType === "webhook" && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 border-l-2 border-l-primary/20 text-sm text-muted-foreground">
                <p>Webhook URL will be available after creation:</p>
                {task && (
                  <code className="mt-1 block text-xs break-all">
                    POST /api/webhooks/{task.id}
                  </code>
                )}
              </div>
            )}

            {isToolTrigger && currentTriggerParams && currentTriggerParams.length > 0 && selectedTriggerInfo?.toolId && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4 border-l-2 border-l-primary/20">
                <TriggerParamEditor
                  params={currentTriggerParams}
                  toolId={selectedTriggerInfo.toolId}
                  values={triggerParams}
                  onChange={setTriggerParams}
                />
              </div>
            )}

            {isToolTrigger && (!currentTriggerParams || currentTriggerParams.length === 0) && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 border-l-2 border-l-primary/20 text-sm text-muted-foreground">
                <p>This trigger fires automatically based on tool settings.</p>
                <p className="mt-1 text-xs">Configure the poll interval in Settings &gt; Tools.</p>
              </div>
            )}
          </section>

          {/* ── Action ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 shrink-0">Action</span>
              <Separator />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-prompt">Prompt</Label>
              <textarea
                id="task-prompt"
                value={actionPrompt}
                onChange={(e) => setActionPrompt(e.target.value)}
                placeholder="Summarize the latest news about AI and provide a brief analysis..."
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                rows={4}
              />
            </div>
          </section>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter className="items-center">
          <div className="flex items-center gap-2 mr-auto">
            <Switch
              id="task-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="task-active" className="text-sm text-muted-foreground">Active</Label>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : task ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
