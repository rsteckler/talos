import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadPrompt(name: string): string {
  return fs.readFileSync(path.join(__dirname, name), "utf-8").trim();
}
