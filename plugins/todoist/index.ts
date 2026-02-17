// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

interface TodoistConfig {
  token: string;
  baseUrl: string;
}

function getConfig(credentials?: Record<string, string>): TodoistConfig {
  const token = credentials?.["api_token"];
  if (!token) {
    throw new Error("Todoist API token is required.");
  }
  return { token, baseUrl: "https://api.todoist.com/api/v1" };
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

async function todoistGet(
  cfg: TodoistConfig,
  path: string,
  params?: Record<string, string>,
): Promise<unknown> {
  let url = `${cfg.baseUrl}/${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Todoist API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function todoistPost(
  cfg: TodoistConfig,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Todoist API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function todoistDelete(
  cfg: TodoistConfig,
  path: string,
): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Todoist API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

/**
 * Auto-paginate a GET endpoint and return all results combined.
 * Suitable for small collections (projects, sections, labels, comments).
 */
async function fetchAll(
  cfg: TodoistConfig,
  path: string,
  params?: Record<string, string>,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor: string | undefined;

  for (;;) {
    const reqParams: Record<string, string> = { ...params };
    if (cursor) reqParams["cursor"] = cursor;

    const raw = await todoistGet(cfg, path, reqParams);

    // The API may return a paginated envelope { results: [...], next_cursor: "..." }
    // or a plain array for non-paginated endpoints.
    if (Array.isArray(raw)) {
      all.push(...raw);
      break;
    }

    const envelope = raw as {
      results?: unknown[];
      next_cursor?: string | null;
    };
    if (envelope.results) {
      all.push(...envelope.results);
    }
    if (envelope.next_cursor) {
      cursor = envelope.next_cursor;
    } else {
      break;
    }
  }

  return all;
}

// ---------------------------------------------------------------------------
// Type helpers for handler args
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;
type Creds = Record<string, string> | undefined;
type Handler = (args: Args, credentials?: Creds) => Promise<unknown>;

function wrap(fn: (args: Args, cfg: TodoistConfig) => Promise<unknown>): Handler {
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
// Tasks
// ---------------------------------------------------------------------------

const get_tasks = wrap(async (args, cfg) => {
  const { project_id, section_id, label, cursor, limit } = args as {
    project_id?: string;
    section_id?: string;
    label?: string;
    cursor?: string;
    limit?: number;
  };

  const params: Record<string, string> = {};
  if (project_id) params["project_id"] = project_id;
  if (section_id) params["section_id"] = section_id;
  if (label) params["label"] = label;
  if (cursor) params["cursor"] = cursor;
  if (limit) params["limit"] = String(limit);

  return todoistGet(cfg, "tasks", params);
});

const get_task = wrap(async (args, cfg) => {
  const { task_id } = args as { task_id: string };
  return todoistGet(cfg, `tasks/${task_id}`);
});

const add_task = wrap(async (args, cfg) => {
  const {
    content,
    description,
    project_id,
    section_id,
    parent_id,
    labels,
    priority,
    due_string,
    due_date,
    due_datetime,
    due_lang,
    assignee_id,
    order,
  } = args as {
    content: string;
    description?: string;
    project_id?: string;
    section_id?: string;
    parent_id?: string;
    labels?: string[];
    priority?: number;
    due_string?: string;
    due_date?: string;
    due_datetime?: string;
    due_lang?: string;
    assignee_id?: string;
    order?: number;
  };

  const body: Record<string, unknown> = { content };
  if (description !== undefined) body["description"] = description;
  if (project_id) body["project_id"] = project_id;
  if (section_id) body["section_id"] = section_id;
  if (parent_id) body["parent_id"] = parent_id;
  if (labels) body["labels"] = labels;
  if (priority !== undefined) body["priority"] = priority;
  if (due_string) body["due_string"] = due_string;
  if (due_date) body["due_date"] = due_date;
  if (due_datetime) body["due_datetime"] = due_datetime;
  if (due_lang) body["due_lang"] = due_lang;
  if (assignee_id) body["assignee_id"] = assignee_id;
  if (order !== undefined) body["order"] = order;

  return todoistPost(cfg, "tasks", body);
});

const update_task = wrap(async (args, cfg) => {
  const { task_id, ...fields } = args as {
    task_id: string;
    content?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    due_string?: string;
    due_date?: string;
    due_datetime?: string;
    due_lang?: string;
    assignee_id?: string;
  };

  // Only include fields that were explicitly provided
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body[key] = value;
  }

  return todoistPost(cfg, `tasks/${task_id}`, body);
});

const close_task = wrap(async (args, cfg) => {
  const { task_id } = args as { task_id: string };
  return todoistPost(cfg, `tasks/${task_id}/close`);
});

const reopen_task = wrap(async (args, cfg) => {
  const { task_id } = args as { task_id: string };
  return todoistPost(cfg, `tasks/${task_id}/reopen`);
});

const delete_task = wrap(async (args, cfg) => {
  const { task_id } = args as { task_id: string };
  return todoistDelete(cfg, `tasks/${task_id}`);
});

const filter_tasks = wrap(async (args, cfg) => {
  const { filter, cursor, limit } = args as {
    filter: string;
    cursor?: string;
    limit?: number;
  };

  const params: Record<string, string> = { filter };
  if (cursor) params["cursor"] = cursor;
  if (limit) params["limit"] = String(limit);

  return todoistGet(cfg, "tasks", params);
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const get_projects = wrap(async (_args, cfg) => {
  return fetchAll(cfg, "projects");
});

const get_project = wrap(async (args, cfg) => {
  const { project_id } = args as { project_id: string };
  return todoistGet(cfg, `projects/${project_id}`);
});

const add_project = wrap(async (args, cfg) => {
  const { name, color, parent_id, view_style, is_favorite } = args as {
    name: string;
    color?: string;
    parent_id?: string;
    view_style?: string;
    is_favorite?: boolean;
  };

  const body: Record<string, unknown> = { name };
  if (color) body["color"] = color;
  if (parent_id) body["parent_id"] = parent_id;
  if (view_style) body["view_style"] = view_style;
  if (is_favorite !== undefined) body["is_favorite"] = is_favorite;

  return todoistPost(cfg, "projects", body);
});

const update_project = wrap(async (args, cfg) => {
  const { project_id, ...fields } = args as {
    project_id: string;
    name?: string;
    color?: string;
    view_style?: string;
    is_favorite?: boolean;
  };

  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body[key] = value;
  }

  return todoistPost(cfg, `projects/${project_id}`, body);
});

const delete_project = wrap(async (args, cfg) => {
  const { project_id } = args as { project_id: string };
  return todoistDelete(cfg, `projects/${project_id}`);
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const get_sections = wrap(async (args, cfg) => {
  const { project_id } = args as { project_id?: string };
  const params: Record<string, string> = {};
  if (project_id) params["project_id"] = project_id;
  return fetchAll(cfg, "sections", params);
});

const add_section = wrap(async (args, cfg) => {
  const { name, project_id, order } = args as {
    name: string;
    project_id: string;
    order?: number;
  };

  const body: Record<string, unknown> = { name, project_id };
  if (order !== undefined) body["order"] = order;

  return todoistPost(cfg, "sections", body);
});

const update_section = wrap(async (args, cfg) => {
  const { section_id, name } = args as {
    section_id: string;
    name: string;
  };

  return todoistPost(cfg, `sections/${section_id}`, { name });
});

const delete_section = wrap(async (args, cfg) => {
  const { section_id } = args as { section_id: string };
  return todoistDelete(cfg, `sections/${section_id}`);
});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const get_labels = wrap(async (_args, cfg) => {
  return fetchAll(cfg, "labels");
});

const add_label = wrap(async (args, cfg) => {
  const { name, color, order, is_favorite } = args as {
    name: string;
    color?: string;
    order?: number;
    is_favorite?: boolean;
  };

  const body: Record<string, unknown> = { name };
  if (color) body["color"] = color;
  if (order !== undefined) body["order"] = order;
  if (is_favorite !== undefined) body["is_favorite"] = is_favorite;

  return todoistPost(cfg, "labels", body);
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const get_comments = wrap(async (args, cfg) => {
  const { task_id, project_id } = args as {
    task_id?: string;
    project_id?: string;
  };

  if (!task_id && !project_id) {
    throw new Error("Either task_id or project_id is required.");
  }

  const params: Record<string, string> = {};
  if (task_id) params["task_id"] = task_id;
  if (project_id) params["project_id"] = project_id;

  return fetchAll(cfg, "comments", params);
});

const add_comment = wrap(async (args, cfg) => {
  const { content, task_id, project_id } = args as {
    content: string;
    task_id?: string;
    project_id?: string;
  };

  if (!task_id && !project_id) {
    throw new Error("Either task_id or project_id is required.");
  }

  const body: Record<string, unknown> = { content };
  if (task_id) body["task_id"] = task_id;
  if (project_id) body["project_id"] = project_id;

  return todoistPost(cfg, "comments", body);
});

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

interface TodoistTask {
  id: string;
  content: string;
  project_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

const new_task_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
  ): Promise<{ event: { triggerId: string; toolId: string; data?: unknown; summary?: string } | null; newState: Record<string, unknown> }> {
    const cfg = getConfig(credentials);

    const seenIds = new Set((state["seenTaskIds"] as string[] | undefined) ?? []);
    const isFirstPoll = !state["seenTaskIds"];

    // Fetch all active tasks
    const tasks = (await fetchAll(cfg, "tasks")) as TodoistTask[];
    const currentIds = tasks.map((t) => t.id);

    if (isFirstPoll) {
      // First poll: establish baseline, don't fire
      return {
        event: null,
        newState: { seenTaskIds: currentIds },
      };
    }

    // Find tasks we haven't seen before
    const newTasks = tasks.filter((t) => !seenIds.has(t.id));

    if (newTasks.length === 0) {
      return {
        event: null,
        newState: { seenTaskIds: currentIds },
      };
    }

    // Build summary of new tasks
    const taskNames = newTasks.map((t) => t.content).join(", ");
    const summary =
      newTasks.length === 1
        ? `New task: ${newTasks[0]!.content}`
        : `${newTasks.length} new tasks: ${taskNames}`;

    return {
      event: {
        triggerId: "todoist:new_task",
        toolId: "todoist",
        data: { new_tasks: newTasks },
        summary,
      },
      newState: { seenTaskIds: currentIds },
    };
  },
};

// ---------------------------------------------------------------------------
// Export triggers
// ---------------------------------------------------------------------------

export const triggers = {
  new_task: new_task_handler,
};

// ---------------------------------------------------------------------------
// Export handlers
// ---------------------------------------------------------------------------

export const handlers: Record<string, Handler> = {
  get_tasks,
  get_task,
  add_task,
  update_task,
  close_task,
  reopen_task,
  delete_task,
  filter_tasks,
  get_projects,
  get_project,
  add_project,
  update_project,
  delete_project,
  get_sections,
  add_section,
  update_section,
  delete_section,
  get_labels,
  add_label,
  get_comments,
  add_comment,
};
