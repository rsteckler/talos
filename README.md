# Talos

Your AI chief of staff. A self-hosted agent that supports BYOK model providers, scheduled tasks, and extensible tools.

## Project structure

- **apps/server** – Express backend (API, WebSocket, agent orchestration, scheduler). Port **3001**.
- **apps/web** – Vite + React + Tailwind + shadcn/ui frontend. Port **5173**.
- **packages/shared** – Shared TypeScript types and constants.
- **tools/** – File-based tool plugins (Phase 5).
- **website/docs** – Docusaurus docs (Phase 7).

## Prerequisites

- Node.js 18+
- pnpm 9+

## Setup

```bash
pnpm install
```

## Development

Run both server and web in parallel:

```bash
pnpm dev
```

Or run separately:

```bash
pnpm dev:server   # http://localhost:3001
pnpm dev:web      # http://localhost:5173
```

## Health check

- Server: `GET http://localhost:3001/health` → `{ "status": "ok", "service": "talos-server" }`
- Web app proxies `/api` and `/health` to the server when both are running.

## License

Private.
