import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function expandTilde(filePath: string): string {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

interface ReadArgs {
  path: string;
  encoding?: BufferEncoding;
  maxLines?: number;
}

interface WriteArgs {
  path: string;
  content: string;
  encoding?: BufferEncoding;
  append?: boolean;
}

interface ListArgs {
  path: string;
}

async function read(args: Record<string, unknown>): Promise<unknown> {
  const { path: filePath, encoding, maxLines } = args as unknown as ReadArgs;

  try {
    const resolved = path.resolve(expandTilde(filePath));
    const content = fs.readFileSync(resolved, encoding ?? "utf-8");

    if (maxLines && maxLines > 0) {
      const lines = content.split("\n");
      return {
        content: lines.slice(0, maxLines).join("\n"),
        totalLines: lines.length,
        truncated: lines.length > maxLines,
      };
    }

    return { content };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to read file" };
  }
}

async function write(args: Record<string, unknown>): Promise<unknown> {
  const { path: filePath, content, encoding, append } = args as unknown as WriteArgs;

  try {
    const resolved = path.resolve(expandTilde(filePath));
    const dir = path.dirname(resolved);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (append) {
      fs.appendFileSync(resolved, content, encoding ?? "utf-8");
    } else {
      fs.writeFileSync(resolved, content, encoding ?? "utf-8");
    }

    return { success: true, path: resolved };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to write file" };
  }
}

async function list(args: Record<string, unknown>): Promise<unknown> {
  const { path: dirPath } = args as unknown as ListArgs;

  try {
    const resolved = path.resolve(expandTilde(dirPath));
    const entries = fs.readdirSync(resolved, { withFileTypes: true });

    return {
      entries: entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list directory" };
  }
}

export const handlers = { read, write, list };
