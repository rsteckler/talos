import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

interface HAConfig {
  baseUrl: string;
  token: string;
}

function getConfig(credentials?: Record<string, string>): HAConfig {
  const url = credentials?.["url"];
  const token = credentials?.["access_token"];
  if (!url || !token) {
    throw new Error("Home Assistant URL and access token are required.");
  }
  // Strip trailing slash
  const baseUrl = url.replace(/\/+$/, "");
  return { baseUrl, token };
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

async function haGet(cfg: HAConfig, path: string): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/api/${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API error ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function haPost(cfg: HAConfig, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/api/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API error ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function haDelete(cfg: HAConfig, path: string): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/api/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API error ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function haGetRaw(cfg: HAConfig, path: string): Promise<Buffer> {
  const res = await fetch(`${cfg.baseUrl}/api/${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API error ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// WebSocket helper — one-shot connect/auth/command/close
// ---------------------------------------------------------------------------

async function haWsCommand(cfg: HAConfig, type: string, data?: Record<string, unknown>): Promise<unknown> {
  const wsUrl = cfg.baseUrl.replace(/^http/, "ws") + "/api/websocket";

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket command timed out after 30s"));
    }, 30_000);

    const ws = new WebSocket(wsUrl);

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; success?: boolean; result?: unknown };

      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: cfg.token }));
      } else if (msg.type === "auth_ok") {
        ws.send(JSON.stringify({ id: 1, type, ...data }));
      } else if (msg.type === "auth_invalid") {
        clearTimeout(timeout);
        ws.close();
        reject(new Error("Home Assistant authentication failed. Check your access token."));
      } else if (msg.type === "result") {
        clearTimeout(timeout);
        ws.close();
        if (msg.success) {
          resolve(msg.result);
        } else {
          reject(new Error(`HA WS command failed: ${JSON.stringify(msg)}`));
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Type helpers for handler args
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;
type Creds = Record<string, string> | undefined;
type Handler = (args: Args, credentials?: Creds) => Promise<unknown>;

function wrap(fn: (args: Args, cfg: HAConfig) => Promise<unknown>): Handler {
  return async (args, credentials) => {
    try {
      const cfg = getConfig(credentials);
      return await fn(args, cfg);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// Search & Discovery
// ---------------------------------------------------------------------------

const search_entities = wrap(async (args, cfg) => {
  const { query, domain, area, limit } = args as {
    query?: string;
    domain?: string;
    area?: string;
    limit?: number;
  };

  const states = (await haGet(cfg, "states")) as Array<{
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
  }>;

  let filtered = states;

  if (domain) {
    filtered = filtered.filter((s) => s.entity_id.startsWith(domain + "."));
  }
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.entity_id.toLowerCase().includes(q) ||
        String(s.attributes["friendly_name"] ?? "")
          .toLowerCase()
          .includes(q),
    );
  }
  if (area) {
    const a = area.toLowerCase();
    filtered = filtered.filter((s) => {
      const fn = String(s.attributes["friendly_name"] ?? "").toLowerCase();
      return fn.includes(a) || s.entity_id.toLowerCase().includes(a);
    });
  }

  const max = limit ?? 50;
  return {
    total: filtered.length,
    entities: filtered.slice(0, max).map((s) => ({
      entity_id: s.entity_id,
      state: s.state,
      friendly_name: s.attributes["friendly_name"],
      domain: s.entity_id.split(".")[0],
    })),
  };
});

const get_state = wrap(async (args, cfg) => {
  const { entity_id } = args as { entity_id: string };
  return haGet(cfg, `states/${entity_id}`);
});

const get_overview = wrap(async (args, cfg) => {
  const { detail_level } = args as { detail_level?: string };
  const level = detail_level ?? "standard";

  const [config, states] = await Promise.all([
    haGet(cfg, "config") as Promise<Record<string, unknown>>,
    haGet(cfg, "states") as Promise<
      Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>
    >,
  ]);

  // Count by domain
  const domains: Record<string, number> = {};
  for (const s of states) {
    const d = s.entity_id.split(".")[0]!;
    domains[d] = (domains[d] ?? 0) + 1;
  }

  const result: Record<string, unknown> = {
    location_name: config["location_name"],
    version: config["version"],
    total_entities: states.length,
    domains,
  };

  if (level === "standard" || level === "full") {
    // Include unavailable/unknown entities
    const problems = states.filter((s) => s.state === "unavailable" || s.state === "unknown");
    result["problem_entities"] = problems.map((s) => ({
      entity_id: s.entity_id,
      state: s.state,
      friendly_name: s.attributes["friendly_name"],
    }));
  }

  if (level === "full") {
    result["all_entities"] = states.map((s) => ({
      entity_id: s.entity_id,
      state: s.state,
      friendly_name: s.attributes["friendly_name"],
    }));
  }

  return result;
});

const list_services = wrap(async (args, cfg) => {
  const { domain } = args as { domain?: string };
  const services = (await haGet(cfg, "services")) as Array<{
    domain: string;
    services: Record<string, unknown>;
  }>;
  if (domain) {
    return services.filter((s) => s.domain === domain);
  }
  return services;
});

// ---------------------------------------------------------------------------
// Device Control
// ---------------------------------------------------------------------------

const call_service = wrap(async (args, cfg) => {
  const { domain, service, entity_id, data, return_response } = args as {
    domain: string;
    service: string;
    entity_id?: string;
    data?: Record<string, unknown>;
    return_response?: boolean;
  };

  const body: Record<string, unknown> = { ...data };
  if (entity_id) body["entity_id"] = entity_id;
  if (return_response) body["return_response"] = true;

  const path = `services/${domain}/${service}`;
  return haPost(cfg, path, body);
});

const bulk_control = wrap(async (args, cfg) => {
  const { operations } = args as {
    operations: Array<{
      domain: string;
      service: string;
      entity_id?: string;
      data?: Record<string, unknown>;
    }>;
  };

  const results = [];
  for (const op of operations) {
    try {
      const body: Record<string, unknown> = { ...op.data };
      if (op.entity_id) body["entity_id"] = op.entity_id;
      const result = await haPost(cfg, `services/${op.domain}/${op.service}`, body);
      results.push({ operation: `${op.domain}.${op.service}`, entity_id: op.entity_id, success: true, result });
    } catch (err) {
      results.push({
        operation: `${op.domain}.${op.service}`,
        entity_id: op.entity_id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { results };
});

// ---------------------------------------------------------------------------
// History & Monitoring
// ---------------------------------------------------------------------------

const get_history = wrap(async (args, cfg) => {
  const { entity_id, start_time, end_time } = args as {
    entity_id: string;
    start_time?: string;
    end_time?: string;
  };

  const start = start_time ?? new Date(Date.now() - 86400000).toISOString();
  let path = `history/period/${start}?filter_entity_id=${entity_id}&minimal_response&significant_changes_only`;
  if (end_time) path += `&end_time=${end_time}`;

  return haGet(cfg, path);
});

const get_statistics = wrap(async (args, cfg) => {
  const { statistic_ids, start_time, end_time, period } = args as {
    statistic_ids: string[];
    start_time?: string;
    end_time?: string;
    period?: string;
  };

  const data: Record<string, unknown> = {
    statistic_ids,
    period: period ?? "hour",
  };
  if (start_time) data["start_time"] = start_time;
  if (end_time) data["end_time"] = end_time;

  return haWsCommand(cfg, "recorder/statistics_during_period", data);
});

const get_logbook = wrap(async (args, cfg) => {
  const { entity_id, start_time, end_time } = args as {
    entity_id?: string;
    start_time?: string;
    end_time?: string;
  };

  const start = start_time ?? new Date(Date.now() - 86400000).toISOString();
  let path = `logbook/${start}`;
  const params: string[] = [];
  if (entity_id) params.push(`entity=${entity_id}`);
  if (end_time) params.push(`end_time=${end_time}`);
  if (params.length > 0) path += `?${params.join("&")}`;

  return haGet(cfg, path);
});

// ---------------------------------------------------------------------------
// Automation Config
// ---------------------------------------------------------------------------

const get_automation = wrap(async (args, cfg) => {
  const { automation_id } = args as { automation_id?: string };
  if (automation_id) {
    return haGet(cfg, `config/automation/config/${automation_id}`);
  }
  return haWsCommand(cfg, "config/automation/list");
});

const set_automation = wrap(async (args, cfg) => {
  const { automation_id, config } = args as { automation_id?: string; config: Record<string, unknown> };
  if (automation_id) {
    return haPost(cfg, `config/automation/config/${automation_id}`, config);
  }
  // Create — HA requires a unique ID
  const id = `talos_${Date.now()}`;
  return haPost(cfg, `config/automation/config/${id}`, config);
});

const remove_automation = wrap(async (args, cfg) => {
  const { automation_id } = args as { automation_id: string };
  return haDelete(cfg, `config/automation/config/${automation_id}`);
});

const get_automation_traces = wrap(async (args, cfg) => {
  const { automation_id, limit } = args as { automation_id?: string; limit?: number };
  const data: Record<string, unknown> = { domain: "automation" };
  if (automation_id) data["item_id"] = automation_id;
  const traces = await haWsCommand(cfg, "trace/list", data);
  if (limit && Array.isArray(traces)) {
    return traces.slice(0, limit);
  }
  return traces;
});

// ---------------------------------------------------------------------------
// Script Config
// ---------------------------------------------------------------------------

const get_script = wrap(async (args, cfg) => {
  const { script_id } = args as { script_id?: string };
  if (script_id) {
    return haGet(cfg, `config/script/config/${script_id}`);
  }
  return haWsCommand(cfg, "config/script/list");
});

const set_script = wrap(async (args, cfg) => {
  const { script_id, config } = args as { script_id: string; config: Record<string, unknown> };
  return haPost(cfg, `config/script/config/${script_id}`, config);
});

const remove_script = wrap(async (args, cfg) => {
  const { script_id } = args as { script_id: string };
  return haDelete(cfg, `config/script/config/${script_id}`);
});

// ---------------------------------------------------------------------------
// Area Management
// ---------------------------------------------------------------------------

const list_areas = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "config/area_registry/list");
});

const set_area = wrap(async (args, cfg) => {
  const { area_id, name, icon, aliases, labels, floor_id, picture } = args as {
    area_id?: string;
    name: string;
    icon?: string;
    aliases?: string[];
    labels?: string[];
    floor_id?: string;
    picture?: string;
  };

  const data: Record<string, unknown> = { name };
  if (icon !== undefined) data["icon"] = icon;
  if (aliases !== undefined) data["aliases"] = aliases;
  if (labels !== undefined) data["labels"] = labels;
  if (floor_id !== undefined) data["floor_id"] = floor_id;
  if (picture !== undefined) data["picture"] = picture;

  if (area_id) {
    data["area_id"] = area_id;
    return haWsCommand(cfg, "config/area_registry/update", data);
  }
  return haWsCommand(cfg, "config/area_registry/create", data);
});

const remove_area = wrap(async (args, cfg) => {
  const { area_id } = args as { area_id: string };
  return haWsCommand(cfg, "config/area_registry/delete", { area_id });
});

// ---------------------------------------------------------------------------
// Floor Management
// ---------------------------------------------------------------------------

const list_floors = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "config/floor_registry/list");
});

const set_floor = wrap(async (args, cfg) => {
  const { floor_id, name, icon, aliases, labels } = args as {
    floor_id?: string;
    name: string;
    icon?: string;
    aliases?: string[];
    labels?: string[];
  };

  const data: Record<string, unknown> = { name };
  if (icon !== undefined) data["icon"] = icon;
  if (aliases !== undefined) data["aliases"] = aliases;
  if (labels !== undefined) data["labels"] = labels;

  if (floor_id) {
    data["floor_id"] = floor_id;
    return haWsCommand(cfg, "config/floor_registry/update", data);
  }
  return haWsCommand(cfg, "config/floor_registry/create", data);
});

const remove_floor = wrap(async (args, cfg) => {
  const { floor_id } = args as { floor_id: string };
  return haWsCommand(cfg, "config/floor_registry/delete", { floor_id });
});

// ---------------------------------------------------------------------------
// Zone Management
// ---------------------------------------------------------------------------

const list_zones = wrap(async (_args, cfg) => {
  const states = (await haGet(cfg, "states")) as Array<{
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
  }>;
  return states.filter((s) => s.entity_id.startsWith("zone."));
});

const set_zone = wrap(async (args, cfg) => {
  const { zone_id, name, latitude, longitude, radius, icon, passive } = args as {
    zone_id?: string;
    name: string;
    latitude: number;
    longitude: number;
    radius?: number;
    icon?: string;
    passive?: boolean;
  };

  const data: Record<string, unknown> = { name, latitude, longitude };
  if (radius !== undefined) data["radius"] = radius;
  if (icon !== undefined) data["icon"] = icon;
  if (passive !== undefined) data["passive"] = passive;

  if (zone_id) {
    data["zone_id"] = zone_id;
    return haWsCommand(cfg, "zone/update", data);
  }
  return haWsCommand(cfg, "zone/create", data);
});

const remove_zone = wrap(async (args, cfg) => {
  const { zone_id } = args as { zone_id: string };
  return haWsCommand(cfg, "zone/delete", { zone_id });
});

// ---------------------------------------------------------------------------
// Group Management
// ---------------------------------------------------------------------------

const list_groups = wrap(async (_args, cfg) => {
  const states = (await haGet(cfg, "states")) as Array<{
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
  }>;
  return states
    .filter((s) => s.entity_id.startsWith("group."))
    .map((s) => ({
      entity_id: s.entity_id,
      state: s.state,
      friendly_name: s.attributes["friendly_name"],
      entities: s.attributes["entity_id"],
    }));
});

const set_group = wrap(async (args, cfg) => {
  const { name, entity_id, entities } = args as {
    name: string;
    entity_id: string;
    entities: string[];
  };
  return haPost(cfg, "services/group/set", {
    object_id: entity_id.replace(/^group\./, ""),
    name,
    entities,
  });
});

const remove_group = wrap(async (args, cfg) => {
  const { entity_id } = args as { entity_id: string };
  return haPost(cfg, "services/group/remove", {
    object_id: entity_id.replace(/^group\./, ""),
  });
});

// ---------------------------------------------------------------------------
// Label Management
// ---------------------------------------------------------------------------

const list_labels = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "config/label_registry/list");
});

const set_label = wrap(async (args, cfg) => {
  const { label_id, name, icon, color, description } = args as {
    label_id?: string;
    name: string;
    icon?: string;
    color?: string;
    description?: string;
  };

  const data: Record<string, unknown> = { name };
  if (icon !== undefined) data["icon"] = icon;
  if (color !== undefined) data["color"] = color;
  if (description !== undefined) data["description"] = description;

  if (label_id) {
    data["label_id"] = label_id;
    return haWsCommand(cfg, "config/label_registry/update", data);
  }
  return haWsCommand(cfg, "config/label_registry/create", data);
});

const remove_label = wrap(async (args, cfg) => {
  const { label_id } = args as { label_id: string };
  return haWsCommand(cfg, "config/label_registry/delete", { label_id });
});

// ---------------------------------------------------------------------------
// Entity Registry
// ---------------------------------------------------------------------------

const get_entity = wrap(async (args, cfg) => {
  const { entity_id } = args as { entity_id: string };
  return haWsCommand(cfg, "config/entity_registry/get", { entity_id });
});

const set_entity = wrap(async (args, cfg) => {
  const { entity_id, name, icon, area_id, disabled_by, hidden_by, aliases, labels } = args as {
    entity_id: string;
    name?: string;
    icon?: string;
    area_id?: string;
    disabled_by?: string | null;
    hidden_by?: string | null;
    aliases?: string[];
    labels?: string[];
  };

  const data: Record<string, unknown> = { entity_id };
  if (name !== undefined) data["name"] = name;
  if (icon !== undefined) data["icon"] = icon;
  if (area_id !== undefined) data["area_id"] = area_id;
  if (disabled_by !== undefined) data["disabled_by"] = disabled_by;
  if (hidden_by !== undefined) data["hidden_by"] = hidden_by;
  if (aliases !== undefined) data["aliases"] = aliases;
  if (labels !== undefined) data["labels"] = labels;

  return haWsCommand(cfg, "config/entity_registry/update", data);
});

// ---------------------------------------------------------------------------
// Device Registry
// ---------------------------------------------------------------------------

const list_devices = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "config/device_registry/list");
});

const get_device = wrap(async (args, cfg) => {
  const { device_id } = args as { device_id: string };
  const devices = (await haWsCommand(cfg, "config/device_registry/list")) as Array<{
    id: string;
    [key: string]: unknown;
  }>;
  const device = devices.find((d) => d.id === device_id);
  if (!device) return { error: `Device not found: ${device_id}` };
  return device;
});

const update_device = wrap(async (args, cfg) => {
  const { device_id, name_by_user, area_id, disabled_by } = args as {
    device_id: string;
    name_by_user?: string;
    area_id?: string;
    disabled_by?: string | null;
  };

  const data: Record<string, unknown> = { device_id };
  if (name_by_user !== undefined) data["name_by_user"] = name_by_user;
  if (area_id !== undefined) data["area_id"] = area_id;
  if (disabled_by !== undefined) data["disabled_by"] = disabled_by;

  return haWsCommand(cfg, "config/device_registry/update", data);
});

// ---------------------------------------------------------------------------
// Helper Config
// ---------------------------------------------------------------------------

const list_helpers = wrap(async (_args, cfg) => {
  const states = (await haGet(cfg, "states")) as Array<{
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
  }>;
  return states.filter((s) => s.entity_id.match(/^(input_|counter\.|timer\.)/));
});

const set_helper = wrap(async (args, cfg) => {
  const { helper_type, config } = args as {
    helper_type: string;
    config: Record<string, unknown>;
  };
  // Use the config flow to create new helpers
  return haWsCommand(cfg, "config/config_entries/flow", {
    handler: helper_type,
    show_advanced_options: false,
    ...(config as object),
  });
});

const remove_helper = wrap(async (args, cfg) => {
  const { entity_id } = args as { entity_id: string };
  // Get the config entry for this entity
  const entityInfo = (await haWsCommand(cfg, "config/entity_registry/get", { entity_id })) as {
    config_entry_id?: string;
  };
  if (!entityInfo.config_entry_id) {
    return { error: `No config entry found for entity: ${entity_id}` };
  }
  return haWsCommand(cfg, "config_entries/delete", { entry_id: entityInfo.config_entry_id });
});

// ---------------------------------------------------------------------------
// Dashboard Config
// ---------------------------------------------------------------------------

const list_dashboards = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "lovelace/dashboards/list");
});

const get_dashboard = wrap(async (args, cfg) => {
  const { url_path } = args as { url_path?: string };
  const data: Record<string, unknown> = {};
  if (url_path) data["url_path"] = url_path;
  return haWsCommand(cfg, "lovelace/config", data);
});

const set_dashboard = wrap(async (args, cfg) => {
  const { url_path, config } = args as { url_path?: string; config: Record<string, unknown> };
  const data: Record<string, unknown> = { config };
  if (url_path) data["url_path"] = url_path;
  return haWsCommand(cfg, "lovelace/config/save", data);
});

const delete_dashboard = wrap(async (args, cfg) => {
  const { dashboard_id } = args as { dashboard_id: string };
  return haWsCommand(cfg, "lovelace/dashboards/delete", { dashboard_id });
});

const list_dashboard_resources = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "lovelace/resources");
});

const set_dashboard_resource = wrap(async (args, cfg) => {
  const { resource_id, url, res_type } = args as {
    resource_id?: string;
    url: string;
    res_type: string;
  };

  if (resource_id) {
    return haWsCommand(cfg, "lovelace/resources/update", { resource_id, url, res_type });
  }
  return haWsCommand(cfg, "lovelace/resources/create", { url, res_type });
});

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const get_calendar_events = wrap(async (args, cfg) => {
  const { entity_id, start, end } = args as {
    entity_id: string;
    start?: string;
    end?: string;
  };

  const startTime = start ?? new Date().toISOString();
  const endTime = end ?? new Date(Date.now() + 86400000).toISOString();
  return haGet(cfg, `calendars/${entity_id}?start=${startTime}&end=${endTime}`);
});

const create_calendar_event = wrap(async (args, cfg) => {
  const { entity_id, summary, start_date_time, end_date_time, description, location } = args as {
    entity_id: string;
    summary: string;
    start_date_time: string;
    end_date_time: string;
    description?: string;
    location?: string;
  };

  const data: Record<string, unknown> = {
    entity_id,
    summary,
    start_date_time,
    end_date_time,
  };
  if (description !== undefined) data["description"] = description;
  if (location !== undefined) data["location"] = location;

  return haPost(cfg, "services/calendar/create_event", data);
});

const delete_calendar_event = wrap(async (args, cfg) => {
  const { entity_id, uid } = args as { entity_id: string; uid: string };
  return haPost(cfg, "services/calendar/delete_event", { entity_id, uid });
});

// ---------------------------------------------------------------------------
// Todo
// ---------------------------------------------------------------------------

const get_todo_items = wrap(async (args, cfg) => {
  const { entity_id } = args as { entity_id: string };
  return haPost(cfg, "services/todo/get_items", { entity_id, return_response: true });
});

const add_todo_item = wrap(async (args, cfg) => {
  const { entity_id, item, due_date, description } = args as {
    entity_id: string;
    item: string;
    due_date?: string;
    description?: string;
  };

  const data: Record<string, unknown> = { entity_id, item };
  if (due_date !== undefined) data["due_date"] = due_date;
  if (description !== undefined) data["description"] = description;

  return haPost(cfg, "services/todo/add_item", data);
});

const update_todo_item = wrap(async (args, cfg) => {
  const { entity_id, item, rename, status, due_date } = args as {
    entity_id: string;
    item: string;
    rename?: string;
    status?: string;
    due_date?: string;
  };

  const data: Record<string, unknown> = { entity_id, item };
  if (rename !== undefined) data["rename"] = rename;
  if (status !== undefined) data["status"] = status;
  if (due_date !== undefined) data["due_date"] = due_date;

  return haPost(cfg, "services/todo/update_item", data);
});

const remove_todo_item = wrap(async (args, cfg) => {
  const { entity_id, item } = args as { entity_id: string; item: string };
  return haPost(cfg, "services/todo/remove_item", { entity_id, item });
});

// ---------------------------------------------------------------------------
// System Management
// ---------------------------------------------------------------------------

const check_config = wrap(async (_args, cfg) => {
  return haPost(cfg, "config/core/check_config");
});

const restart = wrap(async (args, cfg) => {
  const { confirm } = args as { confirm: boolean };
  if (!confirm) {
    return { error: "Restart requires confirm: true" };
  }
  return haPost(cfg, "services/homeassistant/restart");
});

const reload = wrap(async (args, cfg) => {
  const { target } = args as { target: string };

  if (target === "all") {
    const domains = ["automation", "script", "scene", "group"];
    const results = [];
    for (const d of domains) {
      try {
        await haPost(cfg, `services/${d}/reload`);
        results.push({ domain: d, success: true });
      } catch (err) {
        results.push({ domain: d, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Also reload core
    try {
      await haPost(cfg, "services/homeassistant/reload_core_config");
      results.push({ domain: "core", success: true });
    } catch (err) {
      results.push({ domain: "core", success: false, error: err instanceof Error ? err.message : String(err) });
    }
    return { results };
  }

  if (target === "core") {
    return haPost(cfg, "services/homeassistant/reload_core_config");
  }
  if (target === "themes") {
    return haPost(cfg, "services/frontend/reload_themes");
  }

  // automations, scripts, scenes, groups
  const domain = target.replace(/s$/, ""); // "automations" -> "automation"
  return haPost(cfg, `services/${domain}/reload`);
});

const get_system_health = wrap(async (_args, cfg) => {
  return haWsCommand(cfg, "system_health/info");
});

const get_updates = wrap(async (_args, cfg) => {
  const states = (await haGet(cfg, "states")) as Array<{
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
  }>;
  return states
    .filter((s) => s.entity_id.startsWith("update."))
    .map((s) => ({
      entity_id: s.entity_id,
      state: s.state,
      friendly_name: s.attributes["friendly_name"],
      installed_version: s.attributes["installed_version"],
      latest_version: s.attributes["latest_version"],
      release_url: s.attributes["release_url"],
    }));
});

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

const list_integrations = wrap(async (args, cfg) => {
  const { domain } = args as { domain?: string };
  const entries = (await haWsCommand(cfg, "config_entries/get")) as Array<{
    domain: string;
    [key: string]: unknown;
  }>;
  if (domain) {
    return entries.filter((e) => e.domain === domain);
  }
  return entries;
});

const delete_integration = wrap(async (args, cfg) => {
  const { entry_id } = args as { entry_id: string };
  return haWsCommand(cfg, "config_entries/delete", { entry_id });
});

const set_integration_enabled = wrap(async (args, cfg) => {
  const { entry_id, disabled_by } = args as { entry_id: string; disabled_by: string | null };
  return haWsCommand(cfg, "config_entries/disable", { entry_id, disabled_by });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const render_template = wrap(async (args, cfg) => {
  const { template } = args as { template: string };
  return haPost(cfg, "template", { template });
});

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

const get_camera_image = wrap(async (args, cfg) => {
  const { entity_id } = args as { entity_id: string };
  const buffer = await haGetRaw(cfg, `camera_proxy/${entity_id}`);
  return {
    entity_id,
    image_base64: buffer.toString("base64"),
    content_type: "image/jpeg",
  };
});

// ---------------------------------------------------------------------------
// Blueprints
// ---------------------------------------------------------------------------

const list_blueprints = wrap(async (args, cfg) => {
  const { domain } = args as { domain: string };
  return haWsCommand(cfg, "blueprint/list", { domain });
});

const import_blueprint = wrap(async (args, cfg) => {
  const { url } = args as { url: string };
  return haWsCommand(cfg, "blueprint/import", { url });
});

// ---------------------------------------------------------------------------
// Addons
// ---------------------------------------------------------------------------

const list_addons = wrap(async (_args, cfg) => {
  return haGet(cfg, "hassio/addons");
});

// ---------------------------------------------------------------------------
// File System / Error Log
// ---------------------------------------------------------------------------

const get_error_log = wrap(async (_args, cfg) => {
  return haGet(cfg, "error_log");
});

// ---------------------------------------------------------------------------
// Export all handlers
// ---------------------------------------------------------------------------

export const handlers = {
  // Search & Discovery
  search_entities,
  get_state,
  get_overview,
  list_services,
  // Device Control
  call_service,
  bulk_control,
  // History & Monitoring
  get_history,
  get_statistics,
  get_logbook,
  // Automation Config
  get_automation,
  set_automation,
  remove_automation,
  get_automation_traces,
  // Script Config
  get_script,
  set_script,
  remove_script,
  // Area Management
  list_areas,
  set_area,
  remove_area,
  // Floor Management
  list_floors,
  set_floor,
  remove_floor,
  // Zone Management
  list_zones,
  set_zone,
  remove_zone,
  // Group Management
  list_groups,
  set_group,
  remove_group,
  // Label Management
  list_labels,
  set_label,
  remove_label,
  // Entity Registry
  get_entity,
  set_entity,
  // Device Registry
  list_devices,
  get_device,
  update_device,
  // Helper Config
  list_helpers,
  set_helper,
  remove_helper,
  // Dashboard Config
  list_dashboards,
  get_dashboard,
  set_dashboard,
  delete_dashboard,
  list_dashboard_resources,
  set_dashboard_resource,
  // Calendar
  get_calendar_events,
  create_calendar_event,
  delete_calendar_event,
  // Todo
  get_todo_items,
  add_todo_item,
  update_todo_item,
  remove_todo_item,
  // System Management
  check_config,
  restart,
  reload,
  get_system_health,
  get_updates,
  // Integrations
  list_integrations,
  delete_integration,
  set_integration_enabled,
  // Templates
  render_template,
  // Camera
  get_camera_image,
  // Blueprints
  list_blueprints,
  import_blueprint,
  // Addons
  list_addons,
  // File System / Error Log
  get_error_log,
};
