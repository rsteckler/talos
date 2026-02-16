---
sidebar_position: 3
---

# Handler Functions

The `index.ts` file in each plugin directory exports handler functions that match the function names defined in `manifest.json`.

## Structure

```typescript
import type { ToolContext } from "@talos/server/plugins";

export async function my_function(
  args: { input: string },
  context: ToolContext
): Promise<string> {
  // Your implementation here
  return "result";
}
```

### Parameters

Each handler receives two arguments:

1. **`args`** — The arguments passed by the LLM, matching the JSON Schema defined in the manifest
2. **`context`** — A context object with:
   - `config` — Credential values configured by the user (keyed by credential `name`)
   - `dataDir` — Path to the server's data directory

### Return Value

Handlers must return a string. This string is sent back to the LLM as the tool result. For structured data, serialize to JSON.

## Error Handling

Throw an `Error` to signal failure. The error message is sent to the LLM so it can understand what went wrong and potentially retry or adjust.

```typescript
export async function search(
  args: { query: string },
  context: ToolContext
): Promise<string> {
  const apiKey = context.config["api_key"];
  if (!apiKey) {
    throw new Error("API key not configured. Please set it in Settings → Plugins.");
  }

  // ... implementation
}
```

## Multiple Functions

A single plugin can export multiple functions. Each one must match a function name in the manifest:

```typescript
// manifest.json defines functions: "read" and "list"

export async function read(args: { path: string }): Promise<string> {
  // ...
}

export async function list(args: { path: string }): Promise<string> {
  // ...
}
```

## Logging

Plugins can log to the server's structured logging system by exporting an optional `init` function. The server calls it at load time with a scoped `PluginLogger`.

```typescript
let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

export function init(logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void; debug: (msg: string) => void }) {
  log = logger;
}

export async function my_function(args: { input: string }, context: ToolContext): Promise<string> {
  log.info("Processing request");
  // ...
  return "result";
}
```

Declare `logName` in your manifest to control the log area name. Without it, the plugin ID is used (e.g., `plugin:my-plugin`). With `"logName": "mytool"`, logs appear under `plugin:mytool`.

The log area is automatically registered in the log viewer dropdown when the plugin loads.

## Triggers

Plugins can provide background triggers for the task system. Declare triggers in `manifest.json` and export a `triggers` object from `index.ts`.

### Trigger Handler

Each trigger handler implements a `poll` function that checks for new events:

```typescript
interface TriggerPollResult {
  event: { triggerId: string; pluginId: string; data?: unknown; summary?: string } | null;
  newState: Record<string, unknown>;
}

export const triggers = {
  my_event: {
    async poll(
      credentials: Record<string, string>,
      state: Record<string, unknown>,
      settings: Record<string, string>
    ): Promise<TriggerPollResult> {
      // Check for new events using credentials and previous state
      const hasNewEvent = /* your detection logic */;

      if (hasNewEvent) {
        return {
          event: {
            triggerId: "my_event",
            pluginId: "my-plugin",
            summary: "New event detected: details here",
          },
          newState: { lastChecked: Date.now() },
        };
      }

      return { event: null, newState: state };
    },
  },
};
```

### How Polling Works

1. The poller only runs when at least one active task uses the trigger
2. Poll interval is read from plugin settings (falls back to 5 minutes)
3. `state` is persisted between polls in the `trigger_state` DB table
4. When `event` is non-null, all matching tasks execute with the event summary prepended to the action prompt
5. A concurrency guard prevents overlapping polls for the same trigger

### First Poll Pattern

On the first poll (empty state), establish a baseline without firing an event. This prevents triggering on all existing data when a task is first created:

```typescript
if (!state.lastId) {
  // First poll — get current state as baseline
  return { event: null, newState: { lastId: currentId } };
}
```

## Tips

- Keep handlers focused — one function per action
- Return clear, structured results the LLM can parse
- Include error context in thrown messages
- Validate required credentials early
- Use timeouts for external calls
- Use `init(logger)` for logging instead of `console.log`
