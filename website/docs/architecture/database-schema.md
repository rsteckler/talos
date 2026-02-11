---
sidebar_position: 3
---

# Database Schema

Talos uses SQLite with Drizzle ORM. The database file is stored at `apps/server/data/talos.db`.

## Tables

### providers

LLM provider configurations.

| Column    | Type    | Notes                                              |
|-----------|---------|----------------------------------------------------|
| id        | text    | Primary key (UUID)                                 |
| name      | text    | Display name                                       |
| type      | text    | `openai`, `anthropic`, `google`, `openrouter`      |
| apiKey    | text    | Encrypted API key                                  |
| baseUrl   | text    | Optional custom base URL                           |
| isActive  | boolean | Whether the provider is active                     |
| createdAt | text    | ISO timestamp                                      |

### models

AI model definitions, linked to a provider.

| Column      | Type    | Notes                         |
|-------------|---------|-------------------------------|
| id          | text    | Primary key (UUID)            |
| providerId  | text    | Foreign key → providers.id    |
| modelId     | text    | Provider-specific model ID    |
| displayName | text    | Human-readable name           |
| isDefault   | boolean | Default model for provider    |
| createdAt   | text    | ISO timestamp                 |

### conversations

Chat conversations.

| Column    | Type | Notes              |
|-----------|------|--------------------|
| id        | text | Primary key (UUID) |
| title     | text | Conversation title |
| createdAt | text | ISO timestamp      |
| updatedAt | text | ISO timestamp      |

### messages

Chat messages within conversations.

| Column         | Type | Notes                              |
|----------------|------|------------------------------------|
| id             | text | Primary key (UUID)                 |
| conversationId | text | Foreign key → conversations.id     |
| role           | text | `user`, `assistant`, `system`      |
| content        | text | Message content                    |
| createdAt      | text | ISO timestamp                      |

### tasks

Scheduled and triggered tasks.

| Column        | Type    | Notes                                        |
|---------------|---------|----------------------------------------------|
| id            | text    | Primary key (UUID)                           |
| name          | text    | Task name                                    |
| description   | text    | Optional description                         |
| triggerType   | text    | Open string: builtin (`cron`, `interval`, `webhook`, `manual`) or tool-provided (`toolId:triggerId`) |
| triggerConfig | text    | JSON config (e.g., cron expression)          |
| actionPrompt  | text    | Prompt sent to the LLM                       |
| tools         | text    | JSON array of tool IDs, or null              |
| isActive      | boolean | Whether scheduling is enabled                |
| lastRunAt     | text    | ISO timestamp of last execution              |
| nextRunAt     | text    | ISO timestamp of next scheduled run          |
| createdAt     | text    | ISO timestamp                                |

### taskRuns

Execution history for tasks.

| Column      | Type | Notes                              |
|-------------|------|------------------------------------|
| id          | text | Primary key (UUID)                 |
| taskId      | text | Foreign key → tasks.id             |
| status      | text | `running`, `completed`, `failed`   |
| startedAt   | text | ISO timestamp                      |
| completedAt | text | ISO timestamp                      |
| result      | text | LLM response text                  |
| error       | text | Error message if failed            |

### inbox

Async results and notifications.

| Column    | Type    | Notes                                                |
|-----------|---------|------------------------------------------------------|
| id        | text    | Primary key (UUID)                                   |
| taskRunId | text    | Foreign key → taskRuns.id (nullable)                 |
| title     | text    | Display title                                        |
| content   | text    | Full content                                         |
| type      | text    | `task_result`, `schedule_result`, `notification`     |
| isRead    | boolean | Read status                                          |
| createdAt | text    | ISO timestamp                                        |

### toolConfigs

Tool enablement, credential, and settings storage.

| Column    | Type    | Notes                                        |
|-----------|---------|----------------------------------------------|
| toolId    | text    | Primary key (tool manifest ID)               |
| config    | text    | JSON object with credentials and settings    |
| isEnabled | boolean | Whether the tool is active                   |
| createdAt | text    | ISO timestamp                                |

### triggerState

Persisted state for tool-provided trigger pollers.

| Column     | Type | Notes                                    |
|------------|------|------------------------------------------|
| triggerId  | text | Primary key (e.g., `google:gmail_new_email`) |
| state      | text | JSON state object (trigger-specific)     |
| lastPollAt | text | ISO timestamp of last poll               |
| updatedAt  | text | ISO timestamp                            |

### logs

Structured log entries.

| Column    | Type | Notes                              |
|-----------|------|------------------------------------|
| id        | text | Primary key (UUID)                 |
| timestamp | text | ISO timestamp                      |
| axis      | text | `user` or `dev`                    |
| level     | text | Level within the axis              |
| area      | text | Subsystem area (e.g., `scheduler`) |
| message   | text | Log message                        |
| data      | text | JSON metadata                      |
| createdAt | text | ISO timestamp                      |

### logConfigs

Per-area log level configuration.

| Column    | Type | Notes                                          |
|-----------|------|-------------------------------------------------|
| area      | text | Primary key                                    |
| userLevel | text | `silent`, `low`, `medium`, `high`              |
| devLevel  | text | `silent`, `debug`, `verbose`                   |
| updatedAt | text | ISO timestamp                                  |

### logSettings

Global log settings.

| Column    | Type    | Notes                    |
|-----------|---------|--------------------------|
| id        | text    | Primary key              |
| pruneDays | integer | Auto-prune after N days  |
| updatedAt | text    | ISO timestamp            |
