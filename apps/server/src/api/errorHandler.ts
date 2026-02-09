import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../logger/index.js";

const log = createLogger("api");

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  log.error("Unhandled error", { error: message });
  res.status(500).json({ error: message });
}
