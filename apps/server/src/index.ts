import http from "node:http";
import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import { providerRouter } from "./api/providers.js";
import { conversationRouter } from "./api/conversations.js";
import { soulRouter } from "./api/soul.js";
import { toolRouter } from "./api/tools.js";
import { logRouter } from "./api/logs.js";
import { taskRouter } from "./api/tasks.js";
import { inboxRouter } from "./api/inbox.js";
import { webhookRouter } from "./api/webhooks.js";
import { errorHandler } from "./api/errorHandler.js";
import { attachWebSocket } from "./ws/index.js";
import { loadAllTools } from "./tools/index.js";
import { scheduler } from "./scheduler/index.js";
import { createLogger, initLogger } from "./logger/index.js";

const log = createLogger("server");

const app = express();
const PORT = process.env["PORT"] ?? 3001;

app.use(cors());
app.use(express.json());

// Run database migrations
runMigrations();

// Initialize logger (must be after migrations)
initLogger();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "talos-server" });
});

// API routes
app.use("/api", providerRouter);
app.use("/api", conversationRouter);
app.use("/api", soulRouter);
app.use("/api", toolRouter);
app.use("/api", logRouter);
app.use("/api", taskRouter);
app.use("/api", inboxRouter);
app.use("/api", webhookRouter);

// Error handler (must be last)
app.use(errorHandler);

const server = http.createServer(app);
attachWebSocket(server);

// Load tools, init scheduler, then start listening
loadAllTools().then(() => {
  scheduler.init();
  server.listen(PORT, () => {
    log.info(`Talos server listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  log.error("Failed to load tools", err instanceof Error ? { error: err.message } : undefined);
  // Start anyway even if tool loading fails
  scheduler.init();
  server.listen(PORT, () => {
    log.info(`Talos server listening on http://localhost:${PORT} (tool loading failed)`);
  });
});

// Graceful shutdown
function handleShutdown() {
  log.info("Shutting down...");
  scheduler.shutdown();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
