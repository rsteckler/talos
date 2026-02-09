import fs from "node:fs";
import path from "node:path";

interface ReadArgs {
  path: string;
  encoding?: BufferEncoding;
  maxLines?: number;
}

interface ListArgs {
  path: string;
}

async function read(args: Record<string, unknown>): Promise<unknown> {
  const { path: filePath, encoding, maxLines } = args as unknown as ReadArgs;

  try {
    const resolved = path.resolve(filePath);
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

async function list(args: Record<string, unknown>): Promise<unknown> {
  const { path: dirPath } = args as unknown as ListArgs;

  try {
    const resolved = path.resolve(dirPath);
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

export const handlers = { read, list };
