---
sidebar_position: 4
---

# Plugins

Plugins extend Talos's capabilities by giving the LLM the ability to execute actions locally. Plugins are file-based packages loaded from the `plugins/` directory.

## Bundled Plugins

Talos ships with several built-in plugins:

### Shell

Execute shell commands on the host system.

- **Function:** `execute(command, cwd?, timeout?)`
- **No credentials required**

### Web Search

Search the web using the Tavily API.

- **Function:** `search(query, max_results?)`
- **Requires:** Tavily API key (configured in Settings)

### File Operations

Read, write, and list files and directories on the host system.

- **Functions:** `read(path, encoding?, maxLines?)`, `write(path, content, encoding?, append?)`, `list(path)`
- **No credentials required**

### Google Workspace

Access Gmail, Calendar, Drive, Sheets, Docs, and Slides.

- **Functions:** `gmail_search`, `gmail_read`, `gmail_send`, `gmail_reply`, `gmail_archive`, `calendar_list_events`, `calendar_create_event`, `drive_list`, `drive_read`, `sheets_read`, `sheets_write`, `docs_read`, `slides_read`
- **Requires:** Google Cloud OAuth Client ID and Client Secret, plus OAuth connection
- **Setup guide:** [Google Workspace Setup](../guides/google-workspace-setup)

### Google Maps

Search places, get directions, calculate distances, and geocode addresses.

- **Functions:** `places_search`, `place_details`, `places_nearby`, `directions`, `distance_matrix`, `geocode`, `reverse_geocode`, `place_autocomplete`
- **Requires:** Google Maps API Key (configured in Settings)
- **Setup guide:** [Google Maps Setup](../guides/google-maps-setup)

## Enabling Plugins

1. Go to **Settings → Plugins**
2. Toggle plugins on/off
3. For plugins that require credentials (e.g., Web Search), click **Configure** and enter the required API key

## Plugin Permissions

Some plugins require user approval before execution. When the LLM calls a tool that needs approval, an inline prompt appears in the chat with the tool name and arguments. You can:

- **Approve** — Execute the tool call
- **Deny** — Block the execution and let the LLM know

Plugins like Shell always require approval by default. Other plugins can declare their own permission requirements in their manifest.

## How Plugins Work in Chat

When plugins are enabled, their JSON schemas are included in every LLM request. The LLM decides when to call a tool based on the conversation context.

During chat, tool calls appear as inline indicators showing the tool name, arguments, and result.

## Adding Custom Plugins

See the [Plugin Development](../plugin-development/overview) guide for creating your own plugins.
