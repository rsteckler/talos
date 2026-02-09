import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import { providerRouter } from "./api/providers.js";
import { errorHandler } from "./api/errorHandler.js";

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

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Talos server listening on http://localhost:${PORT}`);
});
