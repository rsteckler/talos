---
sidebar_position: 3
---

# Handler Functions

The `index.ts` file in each tool directory exports handler functions that match the function names defined in `manifest.json`.

## Structure

```typescript
import type { ToolContext } from "@talos/server/tools";

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
    throw new Error("API key not configured. Please set it in Settings → Tools.");
  }

  // ... implementation
}
```

## Multiple Functions

A single tool can export multiple functions. Each one must match a function name in the manifest:

```typescript
// manifest.json defines functions: "read" and "list"

export async function read(args: { path: string }): Promise<string> {
  // ...
}

export async function list(args: { path: string }): Promise<string> {
  // ...
}
```

## Tips

- Keep handlers focused — one function per action
- Return clear, structured results the LLM can parse
- Include error context in thrown messages
- Validate required credentials early
- Use timeouts for external calls
