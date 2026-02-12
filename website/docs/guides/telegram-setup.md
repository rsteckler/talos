---
sidebar_position: 3
---

# Telegram Setup

Connect Talos to Telegram so you can chat from any device.

## Prerequisites

- A Telegram account
- A running Talos instance

## Step 1: Create a Bot with BotFather

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a display name (e.g., "My Talos")
4. Choose a username ending in `bot` (e.g., `my_talos_bot`)
5. BotFather will reply with a **bot token** — copy it

## Step 2: Configure in Talos

1. Open the Talos web UI and go to **Settings**
2. Scroll to the **Channels** section
3. Click the gear icon on the **Telegram** row
4. Paste your bot token into the **Bot Token** field
5. Click **Save**

### Optional: Restrict Access

In the settings dialog, you can enter **Allowed Chat IDs** as a comma-separated list. When set, only those chat IDs can interact with the bot. Leave empty to allow all users.

To find your chat ID, send a message to your bot and check the server logs, or use a bot like [@userinfobot](https://t.me/userinfobot).

## Step 3: Enable the Channel

Toggle the switch next to Telegram to **enable** it. The server logs will show:

```
Telegram bot started as @your_bot_username
```

## Step 4: Start Chatting

1. Open your bot in Telegram
2. Send `/start` to register
3. Send any message to chat with Talos

## Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Register and see welcome message |
| `/new` | Start a fresh conversation |
| `/status` | Check Talos connection status |
| `/inbox` | Show recent inbox items |

## Group Chats

You can add the bot to group chats. In groups, the bot only responds when:

- **@mentioned** (e.g., `@my_talos_bot what's the weather?`)
- **Replied to** (reply to a bot message)

Regular messages in the group are ignored.

## Push Notifications

Enable **Push notifications** in the channel settings to receive task results and inbox items directly in Telegram.

## Tool Approval

When Talos needs to use a tool that requires approval, you'll see inline **Approve** and **Deny** buttons in Telegram. Tap to allow or block the tool call. Unanswered approvals expire after 5 minutes.

## Troubleshooting

- **Bot doesn't respond**: Check that the bot token is correct and the channel is enabled in Settings
- **"Credentials required" warning**: Open the config dialog and enter the bot token
- **Access denied**: If you set allowed chat IDs, make sure your chat ID is in the list
