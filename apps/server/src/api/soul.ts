import { Router } from "express";
import { readSoulFile, writeSoulFile, readToolsFile, writeToolsFile, readHumanFile, writeHumanFile } from "../providers/llm.js";

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

// GET /api/agent/tools
router.get("/agent/tools", (_req, res) => {
  const content = readToolsFile();
  res.json({ data: { content } });
});

// PUT /api/agent/tools
router.put("/agent/tools", (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }

  writeToolsFile(content);
  res.json({ data: { content } });
});

// GET /api/agent/human
router.get("/agent/human", (_req, res) => {
  const content = readHumanFile();
  res.json({ data: { content } });
});

// PUT /api/agent/human
router.put("/agent/human", (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }

  writeHumanFile(content);
  res.json({ data: { content } });
});

export { router as soulRouter };
