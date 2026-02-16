---
sidebar_position: 1
---

# Plugin Development Overview

Talos plugins are file-based packages that live in the `plugins/` directory. Each plugin is a self-contained folder with three files:

```
plugins/
└── my-plugin/
    ├── manifest.json   # Plugin metadata, function schemas, settings, triggers
    ├── prompt.md       # LLM instructions for using the plugin
    └── index.ts        # Handler functions + optional init and trigger handlers
```

## How Plugins Are Loaded

On server startup, the Plugin Runner scans `plugins/*/manifest.json` and loads each valid plugin:

1. Manifest is validated and function schemas are registered
2. `index.ts` is imported — handler functions are mapped to manifest function names
3. If the plugin exports an `init(logger)` function, it's called with a scoped logger
4. If the manifest declares triggers and the module exports `triggers`, they're registered with the trigger system

## Execution Flow

1. LLM receives available tool schemas as part of the chat request
2. LLM decides to call a tool function, returning a `tool_call` with name and arguments
3. If the plugin requires approval, the user is prompted inline in chat
4. Server's Plugin Runner looks up the handler function and executes it
5. Result is sent back to the LLM for the next turn
6. Repeat until the LLM returns a text response

## Plugin Capabilities

### Credentials & Settings

Plugins can define required credentials and user-configurable settings in their manifest. Users configure these via **Settings → Plugins** in the web UI. Both are stored in the `pluginConfigs` database table.

### Logging

Plugins can log to the server's structured logging system. Declare a `logName` in your manifest and export an `init(logger)` function to receive a scoped logger at load time. Logs appear in the log viewer under `plugin:<logName>`.

### Triggers

Plugins can declare background event triggers for the task system. Users create tasks with plugin-provided trigger types, and the server polls for events automatically. See [Handler Functions — Triggers](handler-functions#triggers).

## Getting Started

1. [Manifest Schema](manifest-schema) — Define your plugin's metadata, functions, settings, and triggers
2. [Handler Functions](handler-functions) — Implement execution logic, logging, and triggers
3. [Prompt Engineering](prompt-engineering) — Write effective LLM instructions
4. [Example Plugin](example-tool) — Build a complete plugin from scratch
