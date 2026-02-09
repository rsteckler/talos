# Talos

Your AI chief of staff. A self-hosted agent that supports BYOK model providers, scheduled tasks, and extensible tools.

## Features

- **Bring Your Own Key** — OpenAI, Anthropic, Google, OpenRouter
- **Streaming Chat** — Real-time WebSocket-based conversations with tool calling
- **Scheduled Tasks** — Cron, interval, webhook, and manual triggers
- **Extensible Tools** — File-based plugin system (shell, web search, file read)
- **Inbox** — Async results from tasks delivered in real-time
- **Structured Logging** — Dual-axis logging with per-area configuration
- **Customizable** — SOUL.md system prompt, theme settings

## Project Structure

- **apps/server** – Express backend (API, WebSocket, agent orchestration, scheduler). Port **3001**.
- **apps/web** – Vite + React + Tailwind + shadcn/ui frontend. Port **5173**.
- **packages/shared** – Shared TypeScript types and constants.
- **tools/** – File-based tool plugins.
- **website/** – Docusaurus documentation. Port **3002**.

## Quick Start

```bash
# Prerequisites: Node.js 18+, pnpm 9+
pnpm install
pnpm dev
```

Open http://localhost:5173, add a provider in Settings, and start chatting.

## Development

```bash
pnpm dev            # Run server + web in parallel
pnpm dev:server     # http://localhost:3001
pnpm dev:web        # http://localhost:5173
pnpm dev:docs       # http://localhost:3002
pnpm build          # Build all packages
pnpm typecheck      # Typecheck all packages
```

## Documentation

Full documentation is available at `website/docs/` and can be served locally:

```bash
pnpm dev:docs
```

Covers: [user guide](website/docs/user-guide/), [tool development](website/docs/tool-development/), [API reference](website/docs/api-reference/), and [architecture](website/docs/architecture/).

## Health Check

```bash
curl http://localhost:3001/health
# → { "status": "ok", "service": "talos-server" }
```

## License

Private.
