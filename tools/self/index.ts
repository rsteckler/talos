/** Self Knowledge tool — read and write Talos's own prompt documents. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "apps", "server", "data");

const DOCUMENTS: Record<string, string> = {
  soul: path.join(DATA_DIR, "SOUL.md"),
  tools: path.join(DATA_DIR, "TOOLS.md"),
  human: path.join(DATA_DIR, "HUMAN.md"),
};

function resolveDocument(name: unknown): { path: string } | { error: string } {
  if (typeof name !== "string" || !DOCUMENTS[name]) {
    return { error: `Unknown document: "${String(name)}". Must be one of: soul, tools, human.` };
  }
  return { path: DOCUMENTS[name] };
}

async function read_document(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveDocument(args["document"]);
  if ("error" in resolved) return resolved;

  try {
    const content = fs.readFileSync(resolved.path, "utf-8");
    return { document: args["document"], content };
  } catch {
    return { document: args["document"], content: "" };
  }
}

async function write_document(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveDocument(args["document"]);
  if ("error" in resolved) return resolved;

  const content = args["content"];
  if (typeof content !== "string") {
    return { error: "content must be a string" };
  }

  try {
    fs.writeFileSync(resolved.path, content, "utf-8");
    return { success: true, document: args["document"] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to write document" };
  }
}

export const handlers = { read_document, write_document };
