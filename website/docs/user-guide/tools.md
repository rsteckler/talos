---
sidebar_position: 4
---

# Tools

Tools extend Talos's capabilities by giving the LLM the ability to execute actions locally. Tools are file-based plugins loaded from the `tools/` directory.

## Bundled Tools

Talos ships with three built-in tools:

### Shell

Execute shell commands on the host system.

- **Function:** `execute(command, cwd?, timeout?)`
- **No credentials required**

### Web Search

Search the web using the Tavily API.

- **Function:** `search(query, max_results?)`
- **Requires:** Tavily API key (configured in Settings)

### File Read

Read files and list directories on the host system.

- **Functions:** `read(path, encoding?, maxLines?)`, `list(path)`
- **No credentials required**

## Enabling Tools

1. Go to **Settings → Tools**
2. Toggle tools on/off
3. For tools that require credentials (e.g., Web Search), click **Configure** and enter the required API key

## How Tools Work in Chat

When tools are enabled, their JSON schemas are included in every LLM request. The LLM decides when to call a tool based on the conversation context.

During chat, tool calls appear as inline indicators showing the tool name, arguments, and result.

## Adding Custom Tools

See the [Tool Development](../tool-development/overview) guide for creating your own tools.
