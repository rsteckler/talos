---
slug: /
sidebar_position: 1
---

# Introduction

Talos is a self-hosted AI chief of staff. It connects to your own LLM providers (OpenAI, Anthropic, Google, OpenRouter), executes scheduled tasks, and extends its capabilities through a file-based tool plugin system.

## Key Features

- **Bring Your Own Key** — Connect any OpenAI-compatible, Anthropic, Google, or OpenRouter provider with your own API keys.
- **Streaming Chat** — Real-time WebSocket-based chat with tool calling support.
- **Scheduled Tasks** — Automate recurring work with cron, interval, webhook, or manual triggers.
- **Extensible Tools** — File-based plugin system with manifest-driven tool definitions.
- **Inbox** — Async results from tasks and scheduled runs delivered in real-time.
- **Structured Logging** — Dual-axis logging (user/developer) with configurable levels per area.
- **Customizable Personality** — SOUL.md system prompt you can edit from the UI.

## Architecture at a Glance

```
┌─────────────────────────────────────────────┐
│  Frontend (Vite + React + Tailwind)         │
│  Chat · Inbox · Tasks · Settings · Logs     │
└──────────────────┬──────────────────────────┘
                   │ WebSocket + REST
┌──────────────────▼──────────────────────────┐
│  Backend (Express + Node.js)                │
│  Agent Core · Scheduler · Tool Runner       │
│  Logger · SQLite (Drizzle ORM)              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  LLM Providers (remote)                     │
│  OpenAI · Anthropic · Google · OpenRouter   │
└─────────────────────────────────────────────┘
```

Talos is a "dumb relay + local executor." All intelligence lives in the remote LLM. Talos orchestrates the conversation, executes tools locally, and delivers results.

## Next Steps

- [Installation](getting-started/installation) — Get Talos running locally
- [Configuration](getting-started/configuration) — Set up providers and customize behavior
- [First Chat](getting-started/first-chat) — Send your first message
