import http from "node:http";
import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import { providerRouter } from "./api/providers.js";
import { conversationRouter } from "./api/conversations.js";
import { soulRouter } from "./api/soul.js";
import { errorHandler } from "./api/errorHandler.js";
import { attachWebSocket } from "./ws/index.js";

const app = express();
const PORT = process.env["PORT"] ?? 3001;

app.use(cors());
app.use(express.json());

// Run database migrations
runMigrations();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "talos-server" });
});

// API routes
app.use("/api", providerRouter);
app.use("/api", conversationRouter);
app.use("/api", soulRouter);

// Error handler (must be last)
app.use(errorHandler);

const server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`Talos server listening on http://localhost:${PORT}`);
});
