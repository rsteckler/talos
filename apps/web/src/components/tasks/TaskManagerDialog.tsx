import { useState, useMemo } from "react"
import { Search, ListTodo, Clock, RefreshCw, Globe, Play, Trash2, Pencil, Plus, Zap } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TaskDialog } from "@/components/tasks/TaskDialog"
import { useTaskStore } from "@/stores"
import type { Task } from "@talos/shared/types"

const TRIGGER_ICONS: Record<string, typeof Clock> = {
  cron: Clock,
  interval: RefreshCw,
  webhook: Globe,
  manual: Play,
}

function triggerLabel(type: string): string {
  switch (type) {
    case "cron": return "Cron"
    case "interval": return "Interval"
    case "webhook": return "Webhook"
    case "manual": return "Manual"
    default: return type.includes(":") ? type.split(":")[1]! : type
  }
}

interface TaskManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskManagerDialog({ open, onOpenChange }: TaskManagerDialogProps) {
  const allTasks = useTaskStore((s) => s.tasks)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const triggerTask = useTaskStore((s) => s.triggerTask)

  const [searchQuery, setSearchQuery] = useState("")
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const tasks = useMemo(() => {
    const sorted = [...allTasks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    if (!searchQuery.trim()) return sorted
    const q = searchQuery.toLowerCase()
    return sorted.filter(
      (task) =>
        task.name.toLowerCase().includes(q) ||
        (task.description?.toLowerCase().includes(q) ?? false) ||
        task.trigger_type.toLowerCase().includes(q)
    )
  }, [allTasks, searchQuery])

  function handleCreate() {
    setEditingTask(null)
    setTaskDialogOpen(true)
  }

  function handleEdit(task: Task) {
    setEditingTask(task)
    setTaskDialogOpen(true)
  }

  async function handleDelete(taskId: string) {
    try {
      setActionError(null)
      await deleteTask(taskId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete task")
    }
  }

  async function handleTrigger(taskId: string) {
    try {
      setActionError(null)
      await triggerTask(taskId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to trigger task")
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>All Tasks</DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thumb-only px-6 pb-6 min-h-0">
            {actionError && (
              <p className="mb-2 text-sm text-destructive">{actionError}</p>
            )}

            {tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ListTodo className="size-8 mb-2" />
                <p className="text-sm">
                  {searchQuery ? "No tasks found" : "No tasks yet"}
                </p>
              </div>
            )}

            <div className="space-y-1">
              {tasks.map((task) => {
                const TriggerIcon = TRIGGER_ICONS[task.trigger_type] ?? Zap
                return (
                  <div key={task.id} className="rounded-lg border border-border">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <TriggerIcon className="size-4 shrink-0 text-primary" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{task.name}</span>
                        {task.description && (
                          <span className="truncate text-xs text-muted-foreground">{task.description}</span>
                        )}
                      </div>
                      <Badge variant={task.is_active ? "default" : "secondary"} className="shrink-0 text-[10px]">
                        {task.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {triggerLabel(task.trigger_type)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        title="Edit"
                        onClick={() => handleEdit(task)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        title="Run now"
                        onClick={() => handleTrigger(task.id)}
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        title="Delete"
                        onClick={() => setDeletingTaskId(task.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pt-3">
              <Button variant="outline" size="sm" onClick={handleCreate}>
                <Plus className="size-4 mr-1" />
                New Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TaskDialog
        task={editingTask}
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
      />
      <ConfirmDialog
        open={deletingTaskId !== null}
        onOpenChange={(o) => { if (!o) setDeletingTaskId(null) }}
        title="Delete Task"
        description="Delete this task? This cannot be undone."
        onConfirm={() => {
          if (deletingTaskId) handleDelete(deletingTaskId)
        }}
      />
    </>
  )
}
