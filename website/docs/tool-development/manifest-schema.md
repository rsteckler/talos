---
sidebar_position: 2
---

# Manifest Schema

Every tool must have a `manifest.json` in its root directory. This file defines the tool's identity, credentials, and callable functions.

## Full Schema

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "description": "A short description of what the tool does.",
  "version": "1.0.0",
  "logName": "mytool",
  "credentials": [
    {
      "name": "api_key",
      "label": "API Key",
      "description": "Your service API key",
      "required": true
    }
  ],
  "settings": [
    {
      "name": "poll_interval_minutes",
      "label": "Poll interval (minutes)",
      "type": "number",
      "default": "5",
      "description": "How often to check for new events"
    }
  ],
  "triggers": [
    {
      "id": "new_event",
      "label": "New event detected",
      "description": "Fires when a new event is detected"
    }
  ],
  "functions": [
    {
      "name": "do_something",
      "description": "Description shown to the LLM.",
      "parameters": {
        "type": "object",
        "properties": {
          "input": {
            "type": "string",
            "description": "The input to process."
          }
        },
        "required": ["input"]
      }
    }
  ]
}
```

## Fields

### Top-Level

| Field         | Type     | Required | Description                          |
|---------------|----------|----------|--------------------------------------|
| `id`          | string   | Yes      | Unique identifier (matches folder name) |
| `name`        | string   | Yes      | Display name shown in the UI         |
| `description` | string   | Yes      | Short description of the tool        |
| `version`     | string   | Yes      | Semantic version                     |
| `logName`     | string   | No       | Name used in log area (appears as `tool:<logName>` in logs) |
| `credentials` | array    | No       | Credential requirements              |
| `settings`    | array    | No       | User-configurable settings (shown in Settings UI) |
| `triggers`    | array    | No       | Event triggers for the task system   |
| `functions`   | array    | Yes      | Callable function definitions        |

### Credentials

| Field         | Type    | Required | Description                          |
|---------------|---------|----------|--------------------------------------|
| `name`        | string  | Yes      | Key name (used to access in handler) |
| `label`       | string  | Yes      | Label shown in the Settings UI       |
| `description` | string  | No       | Help text for the user               |
| `required`    | boolean | Yes      | Whether the credential must be set   |

### Settings

Settings are user-configurable values shown in **Settings → Tools** alongside credentials. Unlike credentials, settings use regular input fields (not password fields).

| Field         | Type    | Required | Description                              |
|---------------|---------|----------|------------------------------------------|
| `name`        | string  | Yes      | Key name (stored in tool config JSON)    |
| `label`       | string  | Yes      | Label shown in the Settings UI           |
| `type`        | string  | Yes      | `"number"`, `"string"`, or `"boolean"`   |
| `default`     | string  | No       | Default value (as string)                |
| `description` | string  | No       | Help text for the user                   |

### Triggers

Triggers declare background event sources that can fire tasks. Each trigger is a named event that the tool can detect via polling. Trigger IDs are scoped as `{toolId}:{triggerId}` (e.g., `google:gmail_new_email`).

| Field         | Type   | Required | Description                          |
|---------------|--------|----------|--------------------------------------|
| `id`          | string | Yes      | Local trigger ID (scoped by tool)    |
| `label`       | string | Yes      | Display name in the task dialog      |
| `description` | string | No       | Description of when this trigger fires |

See [Handler Functions](handler-functions#triggers) for implementing the polling logic.

### Functions

| Field         | Type   | Required | Description                          |
|---------------|--------|----------|--------------------------------------|
| `name`        | string | Yes      | Function name (matches handler export) |
| `description` | string | Yes      | Description sent to the LLM          |
| `parameters`  | object | Yes      | JSON Schema for function parameters  |

The `parameters` field follows the [JSON Schema](https://json-schema.org/) specification. The LLM uses this schema to understand what arguments to pass when calling the function.

## Example: Shell Tool

```json
{
  "id": "shell",
  "name": "Shell",
  "description": "Execute shell commands on the host system.",
  "version": "1.0.0",
  "functions": [
    {
      "name": "execute",
      "description": "Execute a shell command and return its output.",
      "parameters": {
        "type": "object",
        "properties": {
          "command": {
            "type": "string",
            "description": "The shell command to execute."
          },
          "cwd": {
            "type": "string",
            "description": "Working directory for the command."
          },
          "timeout": {
            "type": "number",
            "description": "Timeout in milliseconds. Defaults to 30000."
          }
        },
        "required": ["command"]
      }
    }
  ]
}
```
