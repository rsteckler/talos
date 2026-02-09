---
sidebar_position: 1
---

# Architecture Overview

Talos is a monorepo with three packages and a tools directory.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (apps/web)                                        │
│  Vite + React + Tailwind + shadcn/ui                        │
│                                                             │
│  ┌──────┐ ┌──────┐ ┌─────┐ ┌────────┐ ┌────┐              │
│  │ Chat │ │Inbox │ │Tasks│ │Settings│ │Logs│              │
│  └──┬───┘ └──┬───┘ └──┬──┘ └───┬────┘ └─┬──┘              │
│     │        │        │        │        │                   │
│  Zustand stores · React Router · WebSocket hook             │
└─────┬────────┬────────┬────────┬────────┬───────────────────┘
      │ WS     │ REST   │ REST   │ REST   │ WS
┌─────▼────────▼────────▼────────▼────────▼───────────────────┐
│  Backend (apps/server)                                      │
│  Express + Node.js                                          │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │Agent Core │  │ Scheduler │  │Tool      │  │ Logger   │  │
│  │(AI SDK)   │  │(node-cron)│  │Runner    │  │(Pino +   │  │
│  │           │  │           │  │          │  │ SQLite)  │  │
│  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────────┘  │
│        │              │              │                       │
│  ┌─────▼──────────────▼──────────────▼─────────────────────┐│
│  │  SQLite (Drizzle ORM)                                   ││
│  │  providers · models · conversations · messages           ││
│  │  tasks · taskRuns · inbox · logs · toolConfigs           ││
│  └─────────────────────────────────────────────────────────┘│
└──────────┬──────────────────────────────────────────────────┘
           │ HTTPS
┌──────────▼──────────────────────────────────────────────────┐
│  LLM Providers (remote)                                     │
│  OpenAI · Anthropic · Google · OpenRouter                   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Chat (Synchronous)

1. User types a message in the web UI
2. Frontend sends via WebSocket to server
3. Server loads system prompt (SOUL.md) + conversation history + tool schemas
4. Sends to the active LLM provider via Vercel AI SDK
5. Streams response tokens back to the frontend via WebSocket
6. If the LLM calls a tool, server executes it locally and sends the result back to the LLM
7. Final message is persisted to SQLite

### Tasks (Asynchronous)

1. Scheduler triggers a task (cron, interval, webhook, or manual)
2. Task's action prompt is sent to the LLM with its allowed tools
3. LLM processes the prompt (may call tools)
4. Result is saved as a task run
5. Inbox item is created and broadcast via WebSocket

## Package Structure

| Package            | Description                        | Port  |
|--------------------|------------------------------------|-------|
| `apps/server`      | Express backend                    | 3001  |
| `apps/web`         | Vite + React frontend              | 5173  |
| `packages/shared`  | Shared TypeScript types/constants  | —     |
| `tools/`           | File-based tool plugins            | —     |
| `website/`         | Docusaurus documentation           | 3002  |

## Technology Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Frontend       | React, Tailwind CSS, shadcn/ui      |
| State          | Zustand                             |
| Routing        | React Router                        |
| Backend        | Express, Node.js                    |
| Database       | SQLite via Drizzle ORM              |
| Real-time      | WebSocket (ws library)              |
| LLM            | Vercel AI SDK                       |
| Scheduling     | node-cron                           |
| Build          | Vite (frontend), tsx (server dev)   |
| Monorepo       | pnpm workspaces + Turborepo        |
