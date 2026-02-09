---
sidebar_position: 2
---

# WebSocket Protocol

Talos uses WebSocket for real-time communication between the frontend and server. The WebSocket server is attached to the HTTP server on the same port (3001).

## Connection

```
ws://localhost:3001
```

Messages are JSON-encoded strings.

## Client Messages (Frontend → Server)

### Chat

Send a message to the LLM:

```json
{
  "type": "chat",
  "conversationId": "conv-uuid",
  "content": "Hello, what can you help me with?"
}
```

If `conversationId` is not an existing conversation, the server creates one.

### Cancel

Cancel an in-progress chat response:

```json
{
  "type": "cancel",
  "conversationId": "conv-uuid"
}
```

### Subscribe to Logs

Start receiving real-time log entries:

```json
{ "type": "subscribe_logs" }
```

### Unsubscribe from Logs

Stop receiving log entries:

```json
{ "type": "unsubscribe_logs" }
```

## Server Messages (Server → Frontend)

### Chunk

A text token from the streaming LLM response:

```json
{
  "type": "chunk",
  "conversationId": "conv-uuid",
  "content": "Hello"
}
```

### End

The LLM response is complete:

```json
{
  "type": "end",
  "conversationId": "conv-uuid",
  "messageId": "msg-uuid"
}
```

### Error

An error occurred:

```json
{
  "type": "error",
  "conversationId": "conv-uuid",
  "error": "Provider API returned 429"
}
```

`conversationId` may be absent for connection-level errors.

### Tool Call

The LLM is calling a tool:

```json
{
  "type": "tool_call",
  "conversationId": "conv-uuid",
  "toolCallId": "call-uuid",
  "toolName": "shell",
  "args": { "command": "ls -la" }
}
```

### Tool Result

The tool execution completed:

```json
{
  "type": "tool_result",
  "conversationId": "conv-uuid",
  "toolCallId": "call-uuid",
  "toolName": "shell",
  "result": "total 48\ndrwxr-xr-x ..."
}
```

### Status

Agent state changed:

```json
{
  "type": "status",
  "status": "thinking"
}
```

Status values: `idle`, `thinking`, `tool_calling`, `responding`

### Inbox

A new inbox item was created:

```json
{
  "type": "inbox",
  "item": {
    "id": "inbox-uuid",
    "title": "Daily Summary completed",
    "content": "...",
    "type": "schedule_result",
    "is_read": false,
    "created_at": "2025-01-15T09:00:00Z"
  }
}
```

### Log

A log entry (only sent to subscribed clients):

```json
{
  "type": "log",
  "entry": {
    "id": "log-uuid",
    "timestamp": "2025-01-15T09:00:00Z",
    "axis": "dev",
    "level": "info",
    "area": "scheduler",
    "message": "Task completed"
  }
}
```

## Message Flow Example

```
Client                          Server
  │                               │
  │── chat ──────────────────────>│
  │                               │── (send to LLM)
  │<──────────────── status ──────│  "thinking"
  │<──────────────── chunk ───────│  "I'll "
  │<──────────────── chunk ───────│  "search "
  │<──────────────── chunk ───────│  "for that."
  │<──────────── tool_call ───────│  web-search
  │<──────────────── status ──────│  "tool_calling"
  │                               │── (execute tool)
  │<────────── tool_result ───────│
  │<──────────────── status ──────│  "responding"
  │<──────────────── chunk ───────│  "Here's what "
  │<──────────────── chunk ───────│  "I found..."
  │<──────────────── end ─────────│
  │<──────────────── status ──────│  "idle"
  │                               │
```
