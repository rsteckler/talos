---
sidebar_position: 3
---

# First Chat

Once you have a provider configured and an active model selected, you're ready to chat.

## Sending a Message

1. Open the web UI at http://localhost:5173
2. You'll see the chat area with an input field at the bottom
3. Type a message and press Enter (or click Send)

Talos will:
1. Create a new conversation
2. Send your message to the active LLM provider
3. Stream the response back in real-time via WebSocket

## What Happens Behind the Scenes

```
You type a message
    ↓
Frontend sends via WebSocket: { type: "chat", content: "...", conversationId: "..." }
    ↓
Server loads system prompt (SOUL.md) + conversation history
    ↓
Sends to LLM API with available tool schemas
    ↓
LLM responds with text → streamed back as chunks
    or
LLM responds with tool_call → server executes tool → sends result back to LLM → repeat
    ↓
Final response displayed in chat
```

## Tool Calls

If you have tools enabled (e.g., Shell, Web Search), the LLM may decide to call them during a conversation. You'll see tool call indicators in the chat showing which tool was called and its result.

## Managing Conversations

- **New Chat** — Click the **+** button in the Conversations sidebar section
- **Switch** — Click any conversation in the sidebar
- **Delete** — Hover over a conversation and click the trash icon (with confirmation)

## Cancelling a Response

If the LLM is taking too long, you can cancel the current response. The server uses an AbortController to cleanly stop the streaming request.

## The Orb

The animated orb in the chat header reflects the current agent state:

| State    | Appearance                    |
|----------|-------------------------------|
| Sleep    | Gray, slow animation          |
| Idle     | Colorful, gentle animation    |
| Turbo    | Fast animation, high sparkle  |

The orb transitions to Turbo when the agent is processing and returns to Idle when done.
