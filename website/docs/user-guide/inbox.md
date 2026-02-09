---
sidebar_position: 3
---

# Inbox

The inbox collects async results from task executions and notifications. It appears in the **Flow** section of the sidebar.

## How It Works

When a task completes, an inbox item is automatically created with the result. Inbox items are delivered in real-time via WebSocket — you don't need to refresh.

## Item Types

| Type              | Description                          |
|-------------------|--------------------------------------|
| `task_result`     | Result from a manually triggered task |
| `schedule_result` | Result from a scheduled task run      |
| `notification`    | General notification                  |

## Reading Items

- Unread items show a cyan dot indicator
- Click an item to mark it as read
- The unread count badge updates in real-time

## API

| Method | Endpoint              | Description          |
|--------|----------------------|----------------------|
| GET    | `/api/inbox`         | List all inbox items |
| PUT    | `/api/inbox/:id/read`| Mark item as read    |
| DELETE | `/api/inbox/:id`     | Delete an item       |

Filter unread items: `GET /api/inbox?unread=true`
