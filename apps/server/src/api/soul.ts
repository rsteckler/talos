import { Router } from "express";
import { readSoulFile, writeSoulFile } from "../providers/llm.js";

const router = Router();

// GET /api/agent/soul
router.get("/agent/soul", (_req, res) => {
  const content = readSoulFile();
  res.json({ data: { content } });
});

// PUT /api/agent/soul
router.put("/agent/soul", (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }

  writeSoulFile(content);
  res.json({ data: { content } });
});

export { router as soulRouter };
