const API_BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function apiGet(path: string): Promise<unknown> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    const json = await res.json();
    if (!res.ok) {
      return { error: (json as { error?: string }).error ?? `Request failed with status ${res.status}` };
    }
    return (json as { data: unknown }).data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}

async function apiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      return { error: (json as { error?: string }).error ?? `Request failed with status ${res.status}` };
    }
    return (json as { data: unknown }).data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}

function isError(result: unknown): result is { error: string } {
  return typeof result === "object" && result !== null && "error" in result;
}

// --- Handlers ---

async function list_providers(): Promise<unknown> {
  return await apiGet("/providers");
}

interface ListModelsArgs {
  providerId: string;
}

async function list_models(args: Record<string, unknown>): Promise<unknown> {
  const { providerId } = args as unknown as ListModelsArgs;
  if (!providerId) {
    return { error: "providerId is required" };
  }
  return await apiGet(`/providers/${encodeURIComponent(providerId)}/models`);
}

async function get_active_model(): Promise<unknown> {
  return await apiGet("/models/active");
}

interface SetActiveModelArgs {
  modelId: string;
}

async function set_active_model(args: Record<string, unknown>): Promise<unknown> {
  const { modelId } = args as unknown as SetActiveModelArgs;
  if (!modelId) {
    return { error: "modelId is required" };
  }
  return await apiRequest("PUT", "/models/active", { modelId });
}

async function get_log_config(): Promise<unknown> {
  const [configs, settings, areas] = await Promise.all([
    apiGet("/logs/configs"),
    apiGet("/logs/settings"),
    apiGet("/logs/areas"),
  ]);

  if (isError(configs)) return configs;
  if (isError(settings)) return settings;
  if (isError(areas)) return areas;

  return { configs, settings, areas };
}

interface SetLogLevelArgs {
  area: string;
  userLevel?: string;
  devLevel?: string;
}

async function set_log_level(args: Record<string, unknown>): Promise<unknown> {
  const { area, userLevel, devLevel } = args as unknown as SetLogLevelArgs;
  if (!area) {
    return { error: "area is required" };
  }
  if (userLevel === undefined && devLevel === undefined) {
    return { error: "At least one of userLevel or devLevel must be provided" };
  }

  // If only one level is provided, fetch current config to preserve the other
  let mergedUserLevel = userLevel;
  let mergedDevLevel = devLevel;

  if (userLevel === undefined || devLevel === undefined) {
    const configs = await apiGet("/logs/configs");
    if (isError(configs)) return configs;

    const existing = (configs as Array<{ area: string; userLevel: string; devLevel: string }>)
      .find((c) => c.area === area);

    if (existing) {
      if (userLevel === undefined) mergedUserLevel = existing.userLevel;
      if (devLevel === undefined) mergedDevLevel = existing.devLevel;
    } else {
      // Area not configured yet — use defaults
      if (userLevel === undefined) mergedUserLevel = "low";
      if (devLevel === undefined) mergedDevLevel = "silent";
    }
  }

  return await apiRequest("PUT", `/logs/configs/${encodeURIComponent(area)}`, {
    userLevel: mergedUserLevel,
    devLevel: mergedDevLevel,
  });
}

interface SetLogRetentionArgs {
  days: number;
}

async function set_log_retention(args: Record<string, unknown>): Promise<unknown> {
  const { days } = args as unknown as SetLogRetentionArgs;
  if (days === undefined || days === null) {
    return { error: "days is required" };
  }
  if (typeof days !== "number" || days < 1 || days > 365) {
    return { error: "days must be a number between 1 and 365" };
  }
  return await apiRequest("PUT", "/logs/settings", { pruneDays: days });
}

export const handlers = {
  list_providers,
  list_models,
  get_active_model,
  set_active_model,
  get_log_config,
  set_log_level,
  set_log_retention,
};
