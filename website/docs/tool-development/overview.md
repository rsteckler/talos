---
sidebar_position: 1
---

# Tool Development Overview

Talos tools are file-based plugins that live in the `tools/` directory. Each tool is a self-contained folder with three files:

```
tools/
└── my-tool/
    ├── manifest.json   # Tool metadata and function schemas
    ├── prompt.md       # LLM instructions for using the tool
    └── index.ts        # Handler functions (TypeScript)
```

## How Tools Are Loaded

On server startup, the Tool Runner scans `tools/*/manifest.json` and loads each valid tool. Tools are registered with their function schemas, which are sent to the LLM as available tool definitions.

## Execution Flow

1. LLM receives available tool schemas as part of the chat request
2. LLM decides to call a tool function, returning a `tool_call` with name and arguments
3. Server's Tool Runner looks up the handler function and executes it
4. Result is sent back to the LLM for the next turn
5. Repeat until the LLM returns a text response

## Tool Configuration

Tools can define required credentials in their manifest. Users configure these via **Settings → Tools** in the web UI. Credentials are stored in the `toolConfigs` database table.

## Getting Started

1. [Manifest Schema](manifest-schema) — Define your tool's metadata and functions
2. [Handler Functions](handler-functions) — Implement the execution logic
3. [Prompt Engineering](prompt-engineering) — Write effective LLM instructions
4. [Example Tool](example-tool) — Build a complete tool from scratch
