import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../logger/index.js";

const log = createLogger("seed");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DEFAULTS_DIR = path.join(__dirname, "..", "..", "defaults");

const FILES = ["SOUL.md", "TOOLS.md", "HUMAN.md", "ONBOARDING.md"];

/**
 * Copy default markdown files into the data directory if they don't already exist.
 * Called once at server startup before anything reads from data/.
 */
export function seedDataFiles(): void {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  for (const file of FILES) {
    const dest = path.join(DATA_DIR, file);
    if (fs.existsSync(dest)) continue;

    const src = path.join(DEFAULTS_DIR, file);
    if (!fs.existsSync(src)) {
      log.dev.debug(`No default for ${file}, skipping`);
      continue;
    }

    fs.copyFileSync(src, dest);
    log.info(`Seeded ${file} from defaults`);
  }
}
