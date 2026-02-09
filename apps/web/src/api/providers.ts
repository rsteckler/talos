import { request } from "./client";
import type {
  Provider,
  ProviderCreateRequest,
  Model,
  ActiveModel,
} from "@talos/shared/types";

export const providersApi = {
  list: () => request<Provider[]>("/providers"),

  create: (data: ProviderCreateRequest) =>
    request<Provider>("/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/providers/${id}`, {
      method: "DELETE",
    }),

  listModels: (providerId: string) =>
    request<Model[]>(`/providers/${providerId}/models`),

  refreshModels: (providerId: string) =>
    request<Model[]>(`/providers/${providerId}/models/refresh`, {
      method: "POST",
    }),

  getActiveModel: () => request<ActiveModel>("/models/active"),

  setActiveModel: (modelId: string) =>
    request<ActiveModel>("/models/active", {
      method: "PUT",
      body: JSON.stringify({ modelId }),
    }),
};
