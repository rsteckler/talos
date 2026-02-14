// Suppress verbose AI SDK error dumps to stderr. The AI SDK internally
// console.error's the full error object (including all tool schemas) before
// propagating it through the stream. We handle and format these errors
// ourselves in agent/core.ts — no need for the raw dump.
const _origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (first instanceof Error && first.name === "AI_APICallError") return;
  _origConsoleError(...args);
};

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
import { themeRouter } from "./api/themes.js";
import { oauthRouter } from "./api/oauth.js";
import { channelRouter } from "./api/channels.js";
import { errorHandler } from "./api/errorHandler.js";
import { attachWebSocket } from "./ws/index.js";
import { loadAllTools } from "./tools/index.js";
import { loadAllChannels, initChannels, shutdownChannels } from "./channels/index.js";
import { scheduler } from "./scheduler/index.js";
import { triggerPoller, triggerSubscriber } from "./triggers/index.js";
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
app.use("/api", themeRouter);
app.use("/api", oauthRouter);
app.use("/api", channelRouter);

// Error handler (must be last)
app.use(errorHandler);

const server = http.createServer(app);
attachWebSocket(server);

// Load tools and channels, init scheduler and trigger poller, then start listening
Promise.all([loadAllTools(), loadAllChannels()]).then(async () => {
  scheduler.init();
  triggerPoller.init();
  triggerSubscriber.init();
  await initChannels().catch((err) => {
    log.error("Failed to init channels", err instanceof Error ? { error: err.message } : undefined);
  });
  server.listen(PORT, () => {
    log.info(`Talos server listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  log.error("Failed to load plugins", err instanceof Error ? { error: err.message } : undefined);
  // Start anyway even if loading fails
  scheduler.init();
  triggerPoller.init();
  triggerSubscriber.init();
  server.listen(PORT, () => {
    log.info(`Talos server listening on http://localhost:${PORT} (plugin loading failed)`);
  });
});

// Graceful shutdown
function handleShutdown() {
  log.info("Shutting down...");
  shutdownChannels().catch(() => {});
  triggerSubscriber.shutdown();
  triggerPoller.shutdown();
  scheduler.shutdown();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
