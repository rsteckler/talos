---
sidebar_position: 1
---

# Installation

## Prerequisites

- **Node.js** 18 or later
- **pnpm** 9 or later

## Setup

1. Clone the repository:

```bash
git clone https://github.com/your-org/talos.git
cd talos
```

2. Install dependencies:

```bash
pnpm install
```

3. Start the development servers:

```bash
pnpm dev
```

This starts both the backend and frontend in parallel:

| Service  | URL                     |
|----------|-------------------------|
| Server   | http://localhost:3001    |
| Web UI   | http://localhost:5173    |

## Directory Structure

```
talos/
├── apps/
│   ├── server/          # Express backend
│   └── web/             # Vite + React frontend
├── packages/
│   └── shared/          # Shared TypeScript types
├── tools/               # File-based tool plugins
│   ├── shell/
│   ├── web-search/
│   └── file-read/
├── website/             # Documentation (Docusaurus)
└── pnpm-workspace.yaml
```

## Running Individual Services

```bash
pnpm dev:server   # Backend only — http://localhost:3001
pnpm dev:web      # Frontend only — http://localhost:5173
pnpm dev:docs     # Documentation — http://localhost:3002
```

## Building for Production

```bash
pnpm build
```

## Health Check

Verify the server is running:

```bash
curl http://localhost:3001/health
# → { "status": "ok", "service": "talos-server" }
```

The web app proxies `/api` and `/health` to the server automatically during development.
