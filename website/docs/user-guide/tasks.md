---
sidebar_position: 2
---

# Tasks

Tasks are automated jobs that Talos executes on a schedule or on demand. Each task has a prompt that is sent to the LLM, and optionally a set of tools it can use.

## Trigger Types

### Built-in Triggers

| Type       | Description                                    | Config Example                        |
|------------|------------------------------------------------|---------------------------------------|
| `cron`     | Runs on a cron schedule                        | `{"cron": "0 9 * * *"}`              |
| `interval` | Runs every N minutes                           | `{"interval_minutes": 30}`            |
| `webhook`  | Triggered via HTTP POST to a webhook endpoint  | `{}`                                  |
| `manual`   | Only runs when manually triggered              | `{}`                                  |

### Tool-Provided Triggers

Tools can declare their own trigger types for event-driven tasks. These appear in the task creation dialog under **Tool Events** when the tool is enabled.

For example, the Google Workspace tool provides a **New Gmail received** trigger (`google:gmail_new_email`) that polls your inbox for new emails. When new mail arrives, any tasks using this trigger fire automatically with the email details included in the prompt.

Tool triggers:
- Only poll when at least one active task uses them
- Have configurable poll intervals (set in **Settings → Tools**)
- Include event data (e.g., email subjects, senders) prepended to the task's action prompt

### Cron Syntax

Cron expressions use the standard five-field format:

```
┌─── minute (0-59)
│ ┌─── hour (0-23)
│ │ ┌─── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─── day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ │
* * * * *
```

Examples:
- `0 9 * * *` — Every day at 9:00 AM
- `*/15 * * * *` — Every 15 minutes
- `0 0 * * 1` — Every Monday at midnight

### Webhooks

Webhook-triggered tasks expose an endpoint:

```
POST /api/webhooks/:task_id
```

Any POST request to this URL triggers the task. The request body is available to the task prompt.

## Creating a Task

1. Click **Add Task** in the Tasks sidebar section
2. Fill in the task name, trigger type, and configuration
3. Write the action prompt — this is sent to the LLM when the task runs
4. Optionally select which tools the task can use
5. Toggle the active switch to enable/disable scheduling

## Task Execution

When a task runs:

1. The action prompt is sent to the LLM with the selected tools
2. The LLM may call tools as part of its response
3. The result is saved as a task run
4. An inbox item is created with the result

### Concurrent Execution Guard

If a task is already running when its next scheduled execution arrives, the scheduler skips the run and logs a warning. This prevents overlapping executions.

## Managing Tasks

The sidebar shows the 3 most recent tasks. When you have more, a **See all tasks** link opens the task manager modal.

### Sidebar

- **Edit** — Click a task in the sidebar to open the edit dialog
- **Run Now** — Hover over a task and click the play button
- **Delete** — Hover over a task and click the trash icon (with confirmation)

### Task Manager Modal

The full task manager provides:

- **Search** across all task names and descriptions
- **Edit** any task (opens the task dialog)
- **Run now** — trigger immediate execution
- **Delete** with confirmation
- **Create** new tasks via the "New Task" button
- Active/inactive status badges and trigger type labels for each task

### Task Dialog

- **Enable/Disable** — Toggle the active switch
- **Trigger type** — Select from built-in triggers or tool-provided triggers (grouped in the dropdown)
- For tool triggers, an info note explains that the trigger fires automatically based on tool settings

## Run History

Task runs are stored with their status, result, and any errors. View recent runs via `GET /api/tasks/:id/runs`.
