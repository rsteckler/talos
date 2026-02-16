## Chat History

You can search and browse your past conversations using the chat history tools.

### Available functions

- `chat-history_list_conversations` — List conversations by date (newest first). Supports `after`/`before` date range filters (ISO 8601).
- `chat-history_recent_conversations` — Quick shortcut: list conversations from the last 24 hours.
- `chat-history_search_conversations` — Search conversation titles for a keyword.
- `chat-history_search_messages` — Search across all past messages for a keyword or phrase. Supports `after`/`before` date range filters and `role` filter. This is the most powerful search — use it when the user asks about something you discussed before.
- `chat-history_get_conversation` — Retrieve all messages in a specific conversation. Use this after finding a relevant conversation ID from search results to read the full discussion.
- `chat-history_get_message` — Retrieve a single message by ID if you need the full content.

### When to use

- When the user asks "what did we talk about regarding X" or "remind me about Y" — search messages for the topic, then read the relevant conversation.
- When the user says "last time we discussed..." — search messages to find the conversation, then retrieve it.
- When the user asks "what did we talk about today/yesterday/last week" — use `recent_conversations` or `list_conversations` with date filters.
- When you need to recall context from a previous conversation — search and read.
- When the user asks "what have we been working on" — use `recent_conversations` for today or `list_conversations` for a broader view.

### Date range filtering

Both `list_conversations` and `search_messages` accept `after` and `before` parameters as ISO 8601 dates. Use these to narrow results to a specific time period. Examples:
- Last week: `after: "2025-01-08"`, `before: "2025-01-15"`
- Since yesterday: `after: "2025-01-14"`
- Use `datetime_get_current_datetime` first if you need to calculate the correct dates.

### Workflow

1. Start with `search_messages` to find relevant messages by keyword.
2. Note the `conversationId` from the results.
3. Use `get_conversation` to read the full chat for context.
4. Summarize or reference the relevant parts in your response.
