import http from "node:http";
import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import { providerRouter } from "./api/providers.js";
import { conversationRouter } from "./api/conversations.js";
import { soulRouter } from "./api/soul.js";
import { toolRouter } from "./api/tools.js";
import { logRouter } from "./api/logs.js";
import { errorHandler } from "./api/errorHandler.js";
import { attachWebSocket } from "./ws/index.js";
import { loadAllTools } from "./tools/index.js";
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

// Error handler (must be last)
app.use(errorHandler);

const server = http.createServer(app);
attachWebSocket(server);

// Load tools then start listening
loadAllTools().then(() => {
  server.listen(PORT, () => {
    log.info(`Talos server listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  log.error("Failed to load tools", err instanceof Error ? { error: err.message } : undefined);
  // Start anyway even if tool loading fails
  server.listen(PORT, () => {
    log.info(`Talos server listening on http://localhost:${PORT} (tool loading failed)`);
  });
});
