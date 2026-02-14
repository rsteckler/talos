import { useEffect, useState } from "react"
import { ListTodo, Plus, Clock, RefreshCw, Globe, Play, Loader2, Zap, ExternalLink } from "lucide-react"
import { TaskDialog } from "@/components/tasks/TaskDialog"
import { TaskManagerDialog } from "@/components/tasks/TaskManagerDialog"
import { useTaskStore } from "@/stores"
import type { Task } from "@talos/shared/types"

const TRIGGER_ICONS: Record<string, typeof Clock> = {
  cron: Clock,
  interval: RefreshCw,
  webhook: Globe,
  manual: Play,
}

const INDETERMINATE_TRIGGERS = new Set(["webhook", "manual", "tool-provided"])

function relativeTimeUntil(dateStr: string): string {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return "now"
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `in ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  const days = Math.floor(hours / 24)
  return `in ${days}d`
}

function sortTasks(tasks: Task[]): Task[] {
  const withTime: Task[] = []
  const withoutTime: Task[] = []

  for (const t of tasks) {
    if (t.next_run_at && !INDETERMINATE_TRIGGERS.has(t.trigger_type)) {
      withTime.push(t)
    } else {
      withoutTime.push(t)
    }
  }

  withTime.sort((a, b) =>
    new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime()
  )
  withoutTime.sort((a, b) => a.name.localeCompare(b.name))

  return [...withTime, ...withoutTime]
}

export function TasksPanel() {
  const allTasks = useTaskStore((s) => s.tasks)
  const isLoading = useTaskStore((s) => s.isLoading)
  const error = useTaskStore((s) => s.error)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)
  const triggerTask = useTaskStore((s) => s.triggerTask)

  const activeTasks = allTasks.filter((t) => t.is_active)
  const tasks = sortTasks(activeTasks)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <div className="px-3 py-2">
        {/* Header actions */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ListTodo className="size-3.5" />
            <span>{activeTasks.length} active</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDialogOpen(true)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New Task"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              onClick={() => setManagerOpen(true)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Manage Tasks"
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Task list */}
        {isLoading && tasks.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </div>
        ) : error && tasks.length === 0 ? (
          <p className="py-4 text-xs text-destructive">{error}</p>
        ) : tasks.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No active tasks</p>
        ) : (
          <div className="space-y-0.5">
            {tasks.map((task) => {
              const TriggerIcon = TRIGGER_ICONS[task.trigger_type] ?? Zap
              return (
                <div
                  key={task.id}
                  className="group/task flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                >
                  <TriggerIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{task.name}</span>
                  {task.next_run_at && !INDETERMINATE_TRIGGERS.has(task.trigger_type) ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums group-hover/task:hidden">
                      {relativeTimeUntil(task.next_run_at)}
                    </span>
                  ) : null}
                  <button
                    className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted group-hover/task:block"
                    title="Run now"
                    onClick={() => triggerTask(task.id)}
                  >
                    <Play className="size-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <TaskDialog task={null} open={dialogOpen} onOpenChange={setDialogOpen} />
      <TaskManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  )
}
