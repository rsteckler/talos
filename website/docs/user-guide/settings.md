---
sidebar_position: 5
---

# Settings

The Settings page is accessible via the gear icon in the sidebar or by navigating to `/settings`.

## Appearance

- **Theme** — Choose between Light, Dark, or System (follows OS preference)

## Model Providers

Manage your LLM provider connections. See [Configuration](../getting-started/configuration) for details on adding and configuring providers.

Each provider row shows:
- Provider type badge (color-coded)
- Provider name
- Currently active model (if any)
- Edit and delete actions

## Tools

Enable and configure tool plugins. Each tool shows its name, description, and status. Tools that require credentials show a configure button.

## Logging

Link to the log viewer. Log retention and pruning settings are configured from the log viewer's settings panel.

## System Prompt (SOUL.md)

A full-text editor for the SOUL.md system prompt. Changes are saved to `apps/server/data/SOUL.md` and take effect on the next chat message.
