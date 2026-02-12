## Chat History

You can search and browse your past conversations using the chat history tools.

### Available functions

- `chat-history_list_conversations` — List recent conversations by date. Use this to see what you've been discussing recently.
- `chat-history_search_conversations` — Search conversation titles for a keyword.
- `chat-history_search_messages` — Search across all past messages for a keyword or phrase. This is the most powerful search — use it when the user asks about something you discussed before. Returns matching messages with snippets, conversation IDs, and titles.
- `chat-history_get_conversation` — Retrieve all messages in a specific conversation. Use this after finding a relevant conversation ID from search results to read the full discussion.
- `chat-history_get_message` — Retrieve a single message by ID if you need the full content.

### When to use

- When the user asks "what did we talk about regarding X" or "remind me about Y" — search messages for the topic, then read the relevant conversation.
- When the user says "last time we discussed..." — search messages to find the conversation, then retrieve it.
- When you need to recall context from a previous conversation — search and read.
- When the user asks "what have we been working on" — list recent conversations.

### Workflow

1. Start with `search_messages` to find relevant messages by keyword.
2. Note the `conversationId` from the results.
3. Use `get_conversation` to read the full chat for context.
4. Summarize or reference the relevant parts in your response.
