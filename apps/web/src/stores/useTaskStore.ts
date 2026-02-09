import { create } from "zustand"
import { tasksApi } from "@/api/tasks"
import type { Task, TaskCreateRequest, TaskUpdateRequest } from "@talos/shared/types"

interface TaskState {
  tasks: Task[]
  isLoading: boolean
  error: string | null
  fetchTasks: () => Promise<void>
  createTask: (data: TaskCreateRequest) => Promise<Task>
  updateTask: (id: string, data: TaskUpdateRequest) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  triggerTask: (id: string) => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null })
    try {
      const tasks = await tasksApi.list()
      set({ tasks, isLoading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to fetch tasks", isLoading: false })
    }
  },

  createTask: async (data) => {
    const task = await tasksApi.create(data)
    set((state) => ({ tasks: [...state.tasks, task] }))
    return task
  },

  updateTask: async (id, data) => {
    const task = await tasksApi.update(id, data)
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? task : t)),
    }))
    return task
  },

  deleteTask: async (id) => {
    await tasksApi.remove(id)
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }))
  },

  triggerTask: async (id) => {
    await tasksApi.trigger(id)
  },
}))
