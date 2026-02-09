import { request } from "./client";
import type {
  Provider,
  ProviderCreateRequest,
  ProviderUpdateRequest,
  Model,
  ActiveModel,
  CatalogModel,
} from "@talos/shared/types";

export const providersApi = {
  list: () => request<Provider[]>("/providers"),

  create: (data: ProviderCreateRequest) =>
    request<Provider>("/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: ProviderUpdateRequest) =>
    request<Provider>(`/providers/${id}`, {
      method: "PUT",
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

  fetchCatalog: (providerId: string) =>
    request<CatalogModel[]>(`/providers/${providerId}/models/catalog`),

  setActiveFromCatalog: (providerId: string, catalogModelId: string, displayName: string) =>
    request<ActiveModel>("/models/active", {
      method: "PUT",
      body: JSON.stringify({ providerId, catalogModelId, displayName }),
    }),
};
