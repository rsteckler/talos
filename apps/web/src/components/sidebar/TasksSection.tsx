import { useEffect, useState } from "react"
import { ChevronRight, ListTodo, Plus, Clock, RefreshCw, Globe, Play, Trash2, Loader2 } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TaskDialog } from "@/components/tasks/TaskDialog"
import { useTaskStore } from "@/stores"
import type { Task, TriggerType } from "@talos/shared/types"

const TRIGGER_ICONS: Record<TriggerType, typeof Clock> = {
  cron: Clock,
  interval: RefreshCw,
  webhook: Globe,
  manual: Play,
}

export function TasksSection() {
  const { state } = useSidebar()
  const tasks = useTaskStore((s) => s.tasks)
  const isLoading = useTaskStore((s) => s.isLoading)
  const error = useTaskStore((s) => s.error)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const triggerTask = useTaskStore((s) => s.triggerTask)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  function handleCreate() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function handleEdit(task: Task) {
    setEditingTask(task)
    setDialogOpen(true)
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

  if (state === "collapsed") {
    return (
      <SidebarGroup>
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
      <Collapsible defaultOpen className="group/collapsible">
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center">
              <ListTodo className="mr-2 size-4" />
              <span>Tasks</span>
              {tasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {tasks.length}
                </Badge>
              )}
              <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
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
                      <span className="text-muted-foreground">No tasks</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  tasks.map((task) => {
                    const TriggerIcon = TRIGGER_ICONS[task.trigger_type]
                    return (
                      <SidebarMenuItem key={task.id}>
                        <div className="group/task relative flex w-full items-center">
                          <SidebarMenuButton
                            className="flex-1"
                            onClick={() => handleEdit(task)}
                          >
                            <TriggerIcon className="size-3.5 shrink-0" />
                            <span className="truncate">{task.name}</span>
                            {!task.is_active && (
                              <span className="ml-auto text-[10px] text-muted-foreground">off</span>
                            )}
                          </SidebarMenuButton>
                          <div className="absolute right-1 opacity-0 group-hover/task:opacity-100 transition-opacity flex items-center gap-0.5">
                            <button
                              className="p-0.5 rounded hover:bg-muted"
                              title="Run now"
                              onClick={(e) => { e.stopPropagation(); handleTrigger(task.id) }}
                            >
                              <Play className="size-3" />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-muted"
                              title="Delete"
                              onClick={(e) => { e.stopPropagation(); setDeletingTaskId(task.id) }}
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </SidebarMenuItem>
                    )
                  })
                )}
                {actionError && (
                  <SidebarMenuItem>
                    <span className="px-2 text-xs text-destructive">{actionError}</span>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={handleCreate}>
                    <Plus className="size-3.5" />
                    <span className="text-muted-foreground">Add Task</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>

      <TaskDialog
        task={editingTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <ConfirmDialog
        open={deletingTaskId !== null}
        onOpenChange={(open) => { if (!open) setDeletingTaskId(null) }}
        title="Delete Task"
        description="Delete this task? This cannot be undone."
        onConfirm={() => {
          if (deletingTaskId) handleDelete(deletingTaskId)
        }}
      />
    </>
  )
}
