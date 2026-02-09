import { request } from "./client";
import type {
  Task,
  TaskRun,
  TaskCreateRequest,
  TaskUpdateRequest,
} from "@talos/shared/types";

export const tasksApi = {
  list: () => request<Task[]>("/tasks"),

  create: (data: TaskCreateRequest) =>
    request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    request<Task & { runs: TaskRun[] }>(`/tasks/${id}`),

  update: (id: string, data: TaskUpdateRequest) =>
    request<Task>(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}`, {
      method: "DELETE",
    }),

  trigger: (id: string) =>
    request<{ message: string }>(`/tasks/${id}/run`, {
      method: "POST",
    }),

  getRuns: (id: string) =>
    request<TaskRun[]>(`/tasks/${id}/runs`),
};
