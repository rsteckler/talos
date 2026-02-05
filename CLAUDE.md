# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Talos is a self-hosted AI chief of staff that supports BYOK model providers, scheduled tasks, and extensible tools. Users interact via chat (sync) and receive results via an inbox (async).

See `.ai/plans/talos_agent_platform.plan.md` for the full implementation plan.

## Commands

```bash
# Install dependencies
pnpm install

# Development - run both server and web in parallel
pnpm dev

# Run individually
pnpm dev:server   # http://localhost:3001
pnpm dev:web      # http://localhost:5173

# Build all packages
pnpm build

# Clean all dist and node_modules
pnpm clean

# Add shadcn components (from apps/web)
pnpm dlx shadcn@latest add <component>
```

## Architecture

This is a pnpm monorepo using Turborepo for task orchestration.

### Packages

- **apps/server** (`@talos/server`) - Express backend on port 3001. Handles API, WebSocket, agent orchestration, and scheduler. Uses tsx for development.
- **apps/web** (`@talos/web`) - Vite + React + Tailwind + shadcn/ui frontend on port 5173. Proxies `/api` and `/health` to the server.
- **packages/shared** (`@talos/shared`) - Shared TypeScript types and constants. Import from `@talos/shared`, `@talos/shared/types`, or `@talos/shared/constants`.
- **tools/** - File-based tool plugins with manifest.json, prompt.md, and index.ts per tool.
- **website/docs/** - Docusaurus documentation (Phase 7).

### Agent Orchestration Pattern

The Agent Core is NOT intelligent - it's a simple orchestration loop that relays messages between user and LLM. The LLM decides when/which tools to call; Talos just executes them locally.

1. Receive user message
2. Send message + available tool schemas to LLM API
3. If LLM returns `tool_call` → execute tool locally via ToolRunner → send result back to LLM → repeat
4. If LLM returns text → stream to user → done

All intelligence lives in the remote LLM. Talos is a "dumb relay + local executor."

### Target Tech Stack

| Layer | Technology |
|-------|------------|
| Database | SQLite via Drizzle ORM |
| Real-time | WebSocket (ws library) |
| LLM Integration | Vercel AI SDK |
| Scheduling | node-cron |

### Key Configuration

- TypeScript uses ES2022 target with NodeNext module resolution (web uses `bundler` for Vite)
- `noUncheckedIndexedAccess` is enabled - handle potential undefined values from index access
- Path alias `@/` maps to `apps/web/src/` in the web app
- Server data directory: `apps/server/data/` (gitignored except .gitkeep) - holds SOUL.md and talos.db

## Implementation Status

**Phase 1 complete.** See plan file for Phase 2-7 details.

Current state:
- Basic Express server with health endpoint
- Vite + React + Tailwind scaffolding with shadcn CSS variable setup
- Empty placeholder directories for future components
- Shared types package (not yet linked to apps)
