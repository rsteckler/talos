---
sidebar_position: 1
---

# Chat

The chat interface is Talos's primary interaction mode. Messages are streamed in real-time via WebSocket.

## Conversations

Each conversation maintains its own message history. The full history is sent with each request to the LLM, providing context for follow-up questions.

Conversations are stored in SQLite and persist across server restarts.

### Creating a Conversation

A new conversation is automatically created when you send the first message. You can also click **New Chat** in the sidebar.

Conversations are auto-titled by the LLM after the first assistant response. The server sends the opening messages to the LLM and asks for a concise title, which is then broadcast to the frontend in real time.

### Switching Conversations

Click any conversation in the sidebar to load it. The full message history is fetched from the server. The sidebar shows the 3 most recent conversations.

### Chat History Modal

When you have more conversations than the sidebar limit, a **See all chats** link appears. Click it to open the chat history modal, which provides:

- **Search** across all conversation titles
- **Open** any conversation
- **Delete** conversations with confirmation

### Deleting a Conversation

Hover over a conversation in the sidebar and click the trash icon. A confirmation dialog appears before deletion. Deleting a conversation removes all its messages.

## Streaming

Responses stream token-by-token via WebSocket. The message flow:

1. **chunk** — Individual text tokens as they arrive
2. **tool_call** — When the LLM decides to call a tool (shows tool name and arguments)
3. **tool_result** — The result of the tool execution
4. **end** — Stream complete, includes the final message ID

## Tool Calling

When tools are enabled, the LLM can invoke them during a conversation. The orchestration loop:

1. LLM returns a `tool_call` response
2. If the tool requires approval, an inline approval prompt appears — you can approve or deny
3. Server executes the tool locally via the Tool Runner
4. Tool result is sent back to the LLM
5. LLM generates a follow-up response (which may include more tool calls)

This loop continues until the LLM returns a text-only response.

## Cancellation

Click the stop button during streaming to cancel the current response. The server aborts the LLM request using an AbortController.
