import { Router } from "express";
import { readSoulFile, writeSoulFile, readPluginsFile, writePluginsFile, readHumanFile, writeHumanFile } from "../providers/llm.js";

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

// GET /api/agent/plugins
router.get("/agent/plugins", (_req, res) => {
  const content = readPluginsFile();
  res.json({ data: { content } });
});

// PUT /api/agent/plugins
router.put("/agent/plugins", (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }

  writePluginsFile(content);
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
