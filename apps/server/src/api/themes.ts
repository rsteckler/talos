import { Router } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ThemeMeta, ThemeFile } from "@talos/shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUILTIN_DIR = path.resolve(__dirname, "../../themes");
const USER_DIR = path.resolve(__dirname, "../../data/themes");

const router = Router();

// --- Helpers ---

function ensureUserDir(): void {
  if (!fs.existsSync(USER_DIR)) {
    fs.mkdirSync(USER_DIR, { recursive: true });
  }
}

function readThemeFile(filePath: string): ThemeFile | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ThemeFile;
  } catch {
    return null;
  }
}

function listThemesInDir(dir: string, builtIn: boolean): ThemeMeta[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const themes: ThemeMeta[] = [];
  for (const file of files) {
    const theme = readThemeFile(path.join(dir, file));
    if (theme) {
      themes.push({
        id: theme.id,
        name: theme.name,
        author: theme.author,
        description: theme.description,
        builtIn,
      });
    }
  }
  return themes;
}

// --- Zod Schema ---

const themeColorsSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  "card-foreground": z.string(),
  popover: z.string(),
  "popover-foreground": z.string(),
  primary: z.string(),
  "primary-foreground": z.string(),
  secondary: z.string(),
  "secondary-foreground": z.string(),
  muted: z.string(),
  "muted-foreground": z.string(),
  accent: z.string(),
  "accent-foreground": z.string(),
  destructive: z.string(),
  "destructive-foreground": z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
  "sidebar-background": z.string(),
  "sidebar-foreground": z.string(),
  "sidebar-primary": z.string(),
  "sidebar-primary-foreground": z.string(),
  "sidebar-accent": z.string(),
  "sidebar-accent-foreground": z.string(),
  "sidebar-border": z.string(),
  "sidebar-ring": z.string(),
});

const themeFileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  light: themeColorsSchema,
  dark: themeColorsSchema,
});

// --- Routes ---

// GET /api/themes
router.get("/themes", (_req, res) => {
  const builtIn = listThemesInDir(BUILTIN_DIR, true);
  const user = listThemesInDir(USER_DIR, false);
  res.json({ data: [...builtIn, ...user] });
});

// GET /api/themes/:id
router.get("/themes/:id", (req, res) => {
  const { id } = req.params;

  // Check built-in first, then user
  const builtInPath = path.join(BUILTIN_DIR, `${id}.json`);
  const userPath = path.join(USER_DIR, `${id}.json`);

  const theme = readThemeFile(builtInPath) ?? readThemeFile(userPath);
  if (!theme) {
    res.status(404).json({ error: "Theme not found" });
    return;
  }

  res.json({ data: theme });
});

// POST /api/themes
router.post("/themes", (req, res) => {
  const result = themeFileSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const theme = result.data;

  // Don't allow overwriting built-in themes
  const builtInPath = path.join(BUILTIN_DIR, `${theme.id}.json`);
  if (fs.existsSync(builtInPath)) {
    res.status(409).json({ error: "Cannot overwrite a built-in theme" });
    return;
  }

  ensureUserDir();
  const userPath = path.join(USER_DIR, `${theme.id}.json`);
  fs.writeFileSync(userPath, JSON.stringify(theme, null, 2));

  res.status(201).json({ data: { id: theme.id, name: theme.name, author: theme.author, description: theme.description, builtIn: false } satisfies ThemeMeta });
});

// DELETE /api/themes/:id
router.delete("/themes/:id", (req, res) => {
  const { id } = req.params;

  // Cannot delete built-in
  const builtInPath = path.join(BUILTIN_DIR, `${id}.json`);
  if (fs.existsSync(builtInPath)) {
    res.status(403).json({ error: "Cannot delete a built-in theme" });
    return;
  }

  const userPath = path.join(USER_DIR, `${id}.json`);
  if (!fs.existsSync(userPath)) {
    res.status(404).json({ error: "Theme not found" });
    return;
  }

  fs.unlinkSync(userPath);
  res.json({ data: { success: true } });
});

export { router as themeRouter };
