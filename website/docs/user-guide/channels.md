---
sidebar_position: 5
---

# Channels

Channels connect Talos to external messaging platforms so you can chat from anywhere — not just the web UI.

## What Are Channels?

A channel is a plugin that bridges an external messaging service (like Telegram) to Talos. When enabled, you can:

- Send messages to Talos from the external platform
- Receive complete responses
- Approve or deny tool usage via inline buttons
- Get push notifications for task results and inbox items

## Configuring Channels

1. Open **Settings** in the Talos web UI
2. Scroll to the **Channels** section
3. Click the gear icon next to a channel to enter credentials
4. Toggle the switch to enable/disable

## Push Notifications

When a channel is enabled, you can also toggle **Push notifications**. With notifications on, Talos will send inbox items (task results, scheduled outputs) to your connected chats.

## Available Channels

### Telegram

Chat with Talos via a Telegram bot in DMs or group chats. See the [Telegram Setup Guide](../guides/telegram-setup) for step-by-step instructions.

## Developing Custom Channels

Channels follow the same plugin architecture as tools. Create a directory under `channels/` with:

- `manifest.json` — Channel metadata, credentials, and settings
- `index.ts` — Exports a `handler` object implementing `ChannelHandler`

The handler receives a `ChannelContext` with methods to chat, manage conversations, and log messages.
