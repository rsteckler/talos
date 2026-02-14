# Todoist

Manage tasks, projects, sections, labels, and comments in the user's Todoist account.

## Tasks

- `todoist_get_tasks` — List active tasks. Optional filters: `project_id`, `section_id`, `label`. Supports pagination via `cursor`/`limit`.
- `todoist_get_task` — Get a single task by `task_id`.
- `todoist_add_task` — Create a task. `content` is required. Use `due_string` for natural language dates (e.g. "tomorrow", "every monday", "Jan 15 at 3pm"). Use `priority` 1–4 where **4 is urgent** (maps to red/p1 in the Todoist UI). Assign `labels` by name, not ID.
- `todoist_update_task` — Update a task. Only send fields you want to change.
- `todoist_close_task` — Complete a task. For recurring tasks, advances to the next occurrence.
- `todoist_reopen_task` — Reopen a previously completed task.
- `todoist_delete_task` — Permanently delete a task. Cannot be undone.
- `todoist_filter_tasks` — Search tasks using Todoist filter syntax (see below). Supports `cursor`/`limit`.

## Projects

- `todoist_get_projects` — List all projects. Use this first to get project IDs.
- `todoist_get_project` — Get a single project by `project_id`.
- `todoist_add_project` — Create a project. `name` is required.
- `todoist_update_project` — Update a project. Only send fields you want to change.
- `todoist_delete_project` — Permanently delete a project and all its tasks.

## Sections

- `todoist_get_sections` — List sections. Optional `project_id` filter.

## Labels

- `todoist_get_labels` — List all personal labels.
- `todoist_add_label` — Create a label. `name` is required.

## Comments

- `todoist_get_comments` — List comments. Requires `task_id` or `project_id`.
- `todoist_add_comment` — Add a comment. Requires `content` and either `task_id` or `project_id`.

## Filter Syntax (for `filter_tasks`)

Todoist filters let you query tasks with a powerful syntax:

| Filter | Example |
|--------|---------|
| Due today | `today` |
| Overdue tasks | `overdue` |
| Due within a range | `due before: Jan 20` or `due after: yesterday` |
| Next 7 days | `7 days` or `next 7 days` |
| No due date | `no date` |
| By project | `#Work` or `#"My Project"` (quote if spaces) |
| By label | `@urgent` or `@"follow up"` |
| By priority | `p1` (urgent/red), `p2`, `p3`, `p4` (no priority) |
| Assigned to me | `assigned to: me` |
| Search content | `search: meeting notes` |
| Boolean AND | `today & #Work` |
| Boolean OR | `overdue \| @urgent` |
| Negate | `!#Inbox` or `!@optional` |
| Combine | `(overdue \| today) & #Work & p1` |

## Triggers

- **Todoist: New task created** — Polls for newly created tasks. On first poll it establishes a baseline of existing tasks; subsequent polls detect any new task IDs that appear. Fires with a summary of new task names and full task data.

## Usage Tips

- **Get project IDs first**: Call `todoist_get_projects` to find project IDs before filtering tasks by project.
- **Priority mapping**: API priority 4 = Todoist UI "Priority 1" (red/urgent). API priority 1 = normal (no priority flag).
- **Natural language dates**: `due_string` supports "tomorrow", "next Monday", "every weekday", "Jan 15 at 2pm", "in 3 days", etc.
- **Labels by name**: When creating or updating tasks, pass label names (e.g. `["urgent", "work"]`), not IDs.
- **Recurring tasks**: Closing a recurring task advances it to the next occurrence rather than permanently completing it.
- **Subtasks**: Use `parent_id` when creating a task to make it a subtask.
