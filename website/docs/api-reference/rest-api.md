---
sidebar_position: 1
---

# REST API

All endpoints are prefixed with `/api` and return JSON. Success responses wrap data in `{ data: T }`. Error responses return `{ error: string }`.

## Providers

### List Providers

```
GET /api/providers
```

**Response:** `{ data: Provider[] }`

### Create Provider

```
POST /api/providers
```

**Body:**

```json
{
  "name": "My OpenAI",
  "type": "openai",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1"
}
```

Type must be one of: `openai`, `anthropic`, `google`, `openrouter`.

**Response:** `201 { data: Provider }`

### Update Provider

```
PUT /api/providers/:id
```

**Body:** Partial provider fields to update.

### Delete Provider

```
DELETE /api/providers/:id
```

### Get Model Catalog

```
GET /api/providers/:id/models/catalog
```

Fetches available models from the provider's API.

### List Provider Models

```
GET /api/providers/:id/models
```

### Refresh Models

```
POST /api/providers/:id/models/refresh
```

Re-fetches and syncs models from the provider.

---

## Active Model

### Get Active Model

```
GET /api/models/active
```

**Response:** `{ data: { provider: Provider, model: Model } }`

### Set Active Model

```
PUT /api/models/active
```

**Body:**

```json
{ "modelId": "model-uuid" }
```

Or set from catalog:

```json
{
  "providerId": "provider-uuid",
  "catalogModelId": "gpt-4",
  "displayName": "GPT-4"
}
```

---

## Conversations

### List Conversations

```
GET /api/conversations
```

Returns conversations ordered by most recently updated.

### Create Conversation

```
POST /api/conversations
```

**Body:**

```json
{ "title": "My Conversation" }
```

### Get Conversation with Messages

```
GET /api/conversations/:id
```

**Response:** `{ data: { ...conversation, messages: Message[] } }`

### Delete Conversation

```
DELETE /api/conversations/:id
```

---

## System Prompt

### Get SOUL.md

```
GET /api/agent/soul
```

**Response:** `{ data: { content: string } }`

### Update SOUL.md

```
PUT /api/agent/soul
```

**Body:**

```json
{ "content": "You are Talos..." }
```

---

## Tools

### List Tools

```
GET /api/tools
```

**Response:** `{ data: Tool[] }` — includes enabled status and credential requirements.

### Get Tool

```
GET /api/tools/:id
```

### Update Tool Config

```
PUT /api/tools/:id/config
```

**Body:**

```json
{ "config": { "api_key": "..." } }
```

### Enable Tool

```
POST /api/tools/:id/enable
```

### Disable Tool

```
POST /api/tools/:id/disable
```

---

## Tasks

### List Tasks

```
GET /api/tasks
```

### Create Task

```
POST /api/tasks
```

**Body:**

```json
{
  "name": "Daily Summary",
  "trigger_type": "cron",
  "trigger_config": "{\"cron\": \"0 9 * * *\"}",
  "action_prompt": "Summarize today's priorities.",
  "tools": ["web-search"],
  "is_active": true
}
```

### Get Task with Runs

```
GET /api/tasks/:id
```

Includes the 20 most recent runs.

### Update Task

```
PUT /api/tasks/:id
```

**Body:** Partial task fields to update.

### Delete Task

```
DELETE /api/tasks/:id
```

### Trigger Task Manually

```
POST /api/tasks/:id/run
```

Returns `202 Accepted` immediately. Returns `409 Conflict` if the task is already running.

### Get Run History

```
GET /api/tasks/:id/runs
```

Returns the 50 most recent runs.

---

## Inbox

### List Inbox Items

```
GET /api/inbox
```

Optional query: `?unread=true`

### Mark as Read

```
PUT /api/inbox/:id/read
```

### Delete Item

```
DELETE /api/inbox/:id
```

---

## Webhooks

### Trigger Webhook Task

```
POST /api/webhooks/:task_id
```

Triggers a webhook-type task. Returns `202 Accepted`.

---

## Logs

### Query Logs

```
GET /api/logs
```

**Query parameters:**

| Param    | Type   | Description                     |
|----------|--------|---------------------------------|
| `limit`  | number | Max results (default 100)       |
| `offset` | number | Pagination offset               |
| `axis`   | string | Filter by axis: `user` or `dev` |
| `level`  | string | Filter by level                 |
| `area`   | string | Filter by area                  |
| `search` | string | Full-text search                |
| `from`   | string | ISO timestamp lower bound       |
| `to`     | string | ISO timestamp upper bound       |

### Purge Logs

```
DELETE /api/logs
```

Deletes all log entries. Returns `{ data: { deleted: number } }`.

### Log Configs

```
GET /api/logs/configs
PUT /api/logs/configs/:area
```

### Log Settings

```
GET /api/logs/settings
PUT /api/logs/settings
```

**Body:**

```json
{ "pruneDays": 7 }
```

### List Areas

```
GET /api/logs/areas
```

---

## Health

```
GET /health
```

**Response:** `{ "status": "ok", "service": "talos-server" }`
