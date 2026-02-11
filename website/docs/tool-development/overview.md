---
sidebar_position: 1
---

# Tool Development Overview

Talos tools are file-based plugins that live in the `tools/` directory. Each tool is a self-contained folder with three files:

```
tools/
└── my-tool/
    ├── manifest.json   # Tool metadata, function schemas, settings, triggers
    ├── prompt.md       # LLM instructions for using the tool
    └── index.ts        # Handler functions + optional init and trigger handlers
```

## How Tools Are Loaded

On server startup, the Tool Runner scans `tools/*/manifest.json` and loads each valid tool:

1. Manifest is validated and function schemas are registered
2. `index.ts` is imported — handler functions are mapped to manifest function names
3. If the tool exports an `init(logger)` function, it's called with a scoped logger
4. If the manifest declares triggers and the module exports `triggers`, they're registered with the trigger system

## Execution Flow

1. LLM receives available tool schemas as part of the chat request
2. LLM decides to call a tool function, returning a `tool_call` with name and arguments
3. If the tool requires approval, the user is prompted inline in chat
4. Server's Tool Runner looks up the handler function and executes it
5. Result is sent back to the LLM for the next turn
6. Repeat until the LLM returns a text response

## Tool Capabilities

### Credentials & Settings

Tools can define required credentials and user-configurable settings in their manifest. Users configure these via **Settings → Tools** in the web UI. Both are stored in the `toolConfigs` database table.

### Logging

Tools can log to the server's structured logging system. Declare a `logName` in your manifest and export an `init(logger)` function to receive a scoped logger at load time. Logs appear in the log viewer under `tool:<logName>`.

### Triggers

Tools can declare background event triggers for the task system. Users create tasks with tool-provided trigger types, and the server polls for events automatically. See [Handler Functions — Triggers](handler-functions#triggers).

## Getting Started

1. [Manifest Schema](manifest-schema) — Define your tool's metadata, functions, settings, and triggers
2. [Handler Functions](handler-functions) — Implement execution logic, logging, and triggers
3. [Prompt Engineering](prompt-engineering) — Write effective LLM instructions
4. [Example Tool](example-tool) — Build a complete tool from scratch
