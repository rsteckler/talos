---
sidebar_position: 4
---

# Logging System

Talos uses a two-axis logging system that separates user-facing logs from developer debugging logs.

## Two Axes

### User Axis

Logs intended for the end user. Levels indicate importance:

| Level    | Purpose                           |
|----------|-----------------------------------|
| `silent` | No user logs                      |
| `low`    | Important events only             |
| `medium` | Normal operational information    |
| `high`   | Detailed operational information  |

### Developer Axis

Logs for debugging and development:

| Level     | Purpose                          |
|-----------|----------------------------------|
| `silent`  | No developer logs                |
| `debug`   | Standard debugging information   |
| `verbose` | Detailed trace-level output      |

## Per-Area Configuration

Each subsystem (area) has independent level settings for both axes. This lets you, for example, set the scheduler to `high` user visibility while keeping the agent core at `low`.

Areas are automatically registered when a subsystem creates a logger:

```typescript
const log = createLogger("scheduler");
```

Configure levels via the API or the Log Viewer UI.

## Storage

Logs are written to two destinations:

1. **SQLite** — All log entries are persisted for querying via the Log Viewer
2. **stdout** — Developer-axis logs are also emitted via Pino for console output

## Log Viewer

The Log Viewer (`/logs` route) provides:

- **Real-time streaming** — Subscribe to live log entries via WebSocket
- **Filtering** — Filter by area, level, and full-text search
- **Retention settings** — Configure auto-prune period (days)
- **Manual purge** — Delete all logs with confirmation

## Auto-Pruning

Logs older than the configured retention period are automatically pruned. The default is 7 days. Configure via **Settings → Log Viewer → Auto-prune after (days)**.

## Creating a Logger

In server code, create a logger for your subsystem:

```typescript
import { createLogger } from "../logger/index.js";

const log = createLogger("my-area");

log.info("Something happened", { key: "value" });
log.warn("Watch out", { detail: "context" });
log.error("Something failed", { error: err.message });
```

The logger automatically tags entries with the area name and timestamps.
