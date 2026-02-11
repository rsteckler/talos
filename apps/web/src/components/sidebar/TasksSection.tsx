import { useEffect, useState } from "react"
import { ListTodo, Plus, Clock, RefreshCw, Globe, Play, Loader2, Zap, ExternalLink } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"
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

const SIDEBAR_TASK_LIMIT = 5

/** Indeterminate trigger types that don't have a predictable next run */
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

export function TasksSection() {
  const { state } = useSidebar()
  const allTasks = useTaskStore((s) => s.tasks)
  const isLoading = useTaskStore((s) => s.isLoading)
  const error = useTaskStore((s) => s.error)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)

  const activeTasks = allTasks.filter((t) => t.is_active)
  const tasks = sortTasks(activeTasks).slice(0, SIDEBAR_TASK_LIMIT)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  // Force re-render every 30s so relative times stay fresh
  const [, setTick] = useState(0)

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  function handleCreate() {
    setDialogOpen(true)
  }

  if (state === "collapsed") {
    return (
      <SidebarGroup className="shrink-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Tasks">
              <ListTodo />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    )
  }

  return (
    <>
      <SidebarGroup className="shrink-0">
        <SidebarGroupLabel className="flex w-full items-center">
          <ListTodo className="mr-2 size-4" />
          <span>Tasks</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              className="p-0.5 rounded hover:bg-muted"
              title="New Task"
              onClick={handleCreate}
            >
              <Plus className="size-3.5" />
            </button>
            <button
              className="p-0.5 rounded hover:bg-muted"
              title="Manage Tasks"
              onClick={() => setManagerOpen(true)}
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {isLoading && tasks.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span className="text-muted-foreground">Loading...</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : error && tasks.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <span className="text-destructive text-xs">{error}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : tasks.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <span className="text-muted-foreground">No active tasks</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              tasks.map((task) => {
                const TriggerIcon = TRIGGER_ICONS[task.trigger_type] ?? Zap
                return (
                  <SidebarMenuItem key={task.id}>
                    <SidebarMenuButton className="flex-1">
                      <TriggerIcon className="size-3.5 shrink-0" />
                      <span className="truncate flex-1">{task.name}</span>
                      {task.next_run_at && !INDETERMINATE_TRIGGERS.has(task.trigger_type) ? (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {relativeTimeUntil(task.next_run_at)}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <TaskDialog
        task={null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <TaskManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  )
}
