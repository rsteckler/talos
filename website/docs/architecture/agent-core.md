---
sidebar_position: 2
---

# Agent Core

The Agent Core is the central orchestration component. It is intentionally simple — a relay between the user and the remote LLM.

## Design Principle

**Talos is NOT intelligent.** It's a dumb relay + local executor. All intelligence lives in the remote LLM. Talos handles:

- Loading context (system prompt, conversation history, tool schemas)
- Sending requests to the LLM API
- Executing tool calls locally
- Streaming responses to the client

## Orchestration Loop

```
┌──────────────┐
│ User Message  │
└──────┬───────┘
       ▼
┌──────────────────────┐
│ Build Request        │
│ - System prompt      │
│ - Conversation history│
│ - Tool schemas       │
└──────┬───────────────┘
       ▼
┌──────────────────────┐
│ Send to LLM API      │◄─────────────────┐
│ (Vercel AI SDK)      │                  │
└──────┬───────────────┘                  │
       ▼                                  │
┌──────────────────────┐                  │
│ LLM Response         │                  │
└──────┬───────────────┘                  │
       ▼                                  │
   ┌───────────┐                          │
   │ Text?     ├──Yes──► Stream to user   │
   └───┬───────┘         (done)           │
       │ No (tool_call)                   │
       ▼                                  │
┌──────────────────────┐                  │
│ Execute Tool Locally  │                  │
│ (Tool Runner)         │                  │
└──────┬───────────────┘                  │
       │                                  │
       │ Send tool result back to LLM     │
       └──────────────────────────────────┘
```

The loop continues until the LLM returns a text response (no more tool calls).

## Implementation

The agent core uses the **Vercel AI SDK** for LLM communication. Key behaviors:

- **Streaming** — Responses are streamed token-by-token via the SDK's streaming API
- **Tool Calling** — The SDK handles the tool call protocol across different providers (OpenAI, Anthropic, etc.)
- **Cancellation** — An AbortController allows clean cancellation of in-progress requests
- **Provider Abstraction** — The SDK normalizes the interface across different LLM providers

## Context Assembly

For each request, the agent core assembles:

1. **System Prompt** — SOUL.md content + enabled tool prompts (from `prompt.md` files)
2. **Conversation History** — All prior messages in the current conversation
3. **Tool Schemas** — JSON Schema definitions from enabled tool manifests

## Status Tracking

The agent broadcasts status updates via WebSocket:

| Status         | Meaning                         |
|----------------|---------------------------------|
| `idle`         | No active request               |
| `thinking`     | Waiting for LLM response        |
| `tool_calling` | Executing a tool call           |
| `responding`   | Streaming text response         |

The frontend uses these to drive the orb animation state.
