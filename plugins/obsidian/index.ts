import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config & path helpers
// ---------------------------------------------------------------------------

interface ObsidianConfig {
  vaultPath: string;
  settings: Record<string, string>;
}

function getConfig(credentials?: Record<string, string>): ObsidianConfig {
  const vaultPath = credentials?.["vault_path"];
  if (!vaultPath) {
    throw new Error(
      "Obsidian vault path is required. Configure it in Settings > Tools > Obsidian.",
    );
  }
  const resolved = path.resolve(vaultPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Vault path does not exist: ${resolved}`);
  }
  return { vaultPath: resolved, settings: credentials ?? {} };
}

/** Resolve a relative note path to an absolute path, sandboxed to the vault root. */
function resolveVaultPath(cfg: ObsidianConfig, relativePath: string): string {
  // Ensure .md extension
  let rel = relativePath;
  if (!rel.endsWith(".md")) rel += ".md";

  const absolute = path.resolve(cfg.vaultPath, rel);

  // Sandbox: must be within vault
  if (!absolute.startsWith(cfg.vaultPath + path.sep) && absolute !== cfg.vaultPath) {
    throw new Error("Path is outside the vault directory");
  }
  return absolute;
}

/** Resolve a folder path, sandboxed to vault root. Returns absolute path. */
function resolveVaultFolder(cfg: ObsidianConfig, folder?: string): string {
  if (!folder) return cfg.vaultPath;
  const absolute = path.resolve(cfg.vaultPath, folder);
  if (!absolute.startsWith(cfg.vaultPath + path.sep) && absolute !== cfg.vaultPath) {
    throw new Error("Folder path is outside the vault directory");
  }
  return absolute;
}

function toRelativePath(cfg: ObsidianConfig, absolutePath: string): string {
  return path.relative(cfg.vaultPath, absolutePath);
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

interface ParsedNote {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

function parseFrontmatter(content: string): ParsedNote {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const yamlBlock = content.slice(4, endIndex).trim();
  const body = content.slice(endIndex + 4).replace(/^\n/, "");

  const frontmatter: Record<string, unknown> = {};
  const lines = yamlBlock.split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Array item continuation
    if (currentKey && currentArray !== null && /^\s*-\s+/.test(line)) {
      currentArray.push(line.replace(/^\s*-\s+/, "").trim());
      continue;
    }

    // Flush any pending array
    if (currentKey && currentArray !== null) {
      frontmatter[currentKey] = currentArray;
      currentKey = null;
      currentArray = null;
    }

    // Key-value line
    const kvMatch = line.match(/^([a-zA-Z_][\w.-]*)\s*:\s*(.*)/);
    if (!kvMatch) continue;

    const key = kvMatch[1]!;
    const rawValue = kvMatch[2]!.trim();

    if (rawValue === "") {
      // Could be start of an array on next lines
      currentKey = key;
      currentArray = [];
      continue;
    }

    // Parse value
    frontmatter[key] = parseYamlValue(rawValue);
  }

  // Flush trailing array
  if (currentKey && currentArray !== null) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null, body };
}

function parseYamlValue(raw: string): unknown {
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  // Inline array: [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => stripQuotes(s));
  }

  // Quoted string
  return stripQuotes(raw);
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function serializeFrontmatter(
  frontmatter: Record<string, unknown> | null,
  body: string,
): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body;
  }

  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${String(item)}`);
      }
    } else if (typeof value === "string" && value.includes(":")) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push("---");

  return lines.join("\n") + "\n" + body;
}

// ---------------------------------------------------------------------------
// Tag & wikilink extraction
// ---------------------------------------------------------------------------

/** Extract inline #tags from body text, excluding code blocks. */
function extractInlineTags(body: string): string[] {
  // Remove code blocks first
  const withoutCode = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "");

  const tags: string[] = [];
  const re = /(?:^|\s)#([a-zA-Z][\w/-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutCode)) !== null) {
    tags.push(match[1]!);
  }
  return tags;
}

/** Extract tags from frontmatter tags field. */
function extractFrontmatterTags(frontmatter: Record<string, unknown> | null): string[] {
  if (!frontmatter) return [];
  const raw = frontmatter["tags"];
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).replace(/^#/, ""));
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter((t) => t.length > 0);
  }
  return [];
}

/** Get all tags from a note (inline + frontmatter), deduplicated. */
function extractTags(content: string): string[] {
  const { frontmatter, body } = parseFrontmatter(content);
  const inline = extractInlineTags(body);
  const fm = extractFrontmatterTags(frontmatter);
  return [...new Set([...inline, ...fm])];
}

/** Extract wikilink targets from content. */
function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    links.push(match[1]!.trim());
  }
  return links;
}

// ---------------------------------------------------------------------------
// Vault walking
// ---------------------------------------------------------------------------

/** Recursively walk a folder and return all .md file absolute paths. */
function walkFolder(dir: string, recursive: boolean): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip .obsidian and other hidden directories
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...walkFolder(fullPath, true));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function walkVault(cfg: ObsidianConfig, folder?: string, recursive = true): string[] {
  const root = resolveVaultFolder(cfg, folder);
  return walkFolder(root, recursive);
}

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

function extractTitle(relativePath: string, content: string): string {
  const { frontmatter, body } = parseFrontmatter(content);

  // 1. Frontmatter title
  if (frontmatter?.["title"] && typeof frontmatter["title"] === "string") {
    return frontmatter["title"];
  }

  // 2. First H1
  const h1Match = body.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1]!.trim();

  // 3. Filename without extension
  return path.basename(relativePath, ".md");
}

// ---------------------------------------------------------------------------
// Wrap helper
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;
type Creds = Record<string, string> | undefined;
type Handler = (args: Args, credentials?: Creds) => Promise<unknown>;

function wrap(fn: (args: Args, cfg: ObsidianConfig) => Promise<unknown>): Handler {
  return async (args, credentials) => {
    try {
      const cfg = getConfig(credentials);
      return await fn(args, cfg);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const search_notes = wrap(async (args, cfg) => {
  const {
    query,
    folder,
    tag,
    frontmatter_field,
    frontmatter_value,
    limit = 20,
  } = args as {
    query: string;
    folder?: string;
    tag?: string;
    frontmatter_field?: string;
    frontmatter_value?: string;
    limit?: number;
  };

  const queryLower = query.toLowerCase();
  const files = walkVault(cfg, folder);
  const results: {
    path: string;
    title: string;
    snippet: string;
  }[] = [];

  for (const filePath of files) {
    if (results.length >= limit) break;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);

    // Tag filter
    if (tag) {
      const tags = [
        ...extractInlineTags(body),
        ...extractFrontmatterTags(frontmatter),
      ];
      if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        continue;
      }
    }

    // Frontmatter field filter
    if (frontmatter_field) {
      if (!frontmatter || !(frontmatter_field in frontmatter)) continue;
      if (
        frontmatter_value !== undefined &&
        String(frontmatter[frontmatter_field]).toLowerCase() !==
          frontmatter_value.toLowerCase()
      ) {
        continue;
      }
    }

    // Content match
    const contentLower = content.toLowerCase();
    const matchIndex = contentLower.indexOf(queryLower);
    if (matchIndex === -1) continue;

    // Build context snippet (matching line ± 1 line)
    const lines = content.split("\n");
    let charCount = 0;
    let matchLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = charCount + lines[i]!.length + 1;
      if (matchIndex < lineEnd) {
        matchLine = i;
        break;
      }
      charCount = lineEnd;
    }

    const startLine = Math.max(0, matchLine - 1);
    const endLine = Math.min(lines.length - 1, matchLine + 1);
    const snippet = lines.slice(startLine, endLine + 1).join("\n");

    const relPath = toRelativePath(cfg, filePath);
    results.push({
      path: relPath,
      title: extractTitle(relPath, content),
      snippet,
    });
  }

  return { results, total: results.length };
});

const read_note = wrap(async (args, cfg) => {
  const { path: notePath } = args as { path: string };
  const absolute = resolveVaultPath(cfg, notePath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Note not found: ${notePath}`);
  }

  const content = fs.readFileSync(absolute, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const tags = extractTags(content);
  const wikilinks = extractWikilinks(content);

  return {
    path: toRelativePath(cfg, absolute),
    frontmatter,
    body,
    tags,
    wikilinks,
  };
});

const create_note = wrap(async (args, cfg) => {
  const { path: notePath, content, frontmatter } = args as {
    path: string;
    content: string;
    frontmatter?: Record<string, unknown>;
  };

  const absolute = resolveVaultPath(cfg, notePath);

  if (fs.existsSync(absolute)) {
    throw new Error(`Note already exists: ${notePath}. Use update_note to modify it.`);
  }

  // Auto-create parent directories
  const dir = path.dirname(absolute);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileContent = serializeFrontmatter(frontmatter ?? null, content);
  fs.writeFileSync(absolute, fileContent, "utf-8");

  return {
    success: true,
    path: toRelativePath(cfg, absolute),
  };
});

const update_note = wrap(async (args, cfg) => {
  const { path: notePath, content, frontmatter } = args as {
    path: string;
    content: string;
    frontmatter?: Record<string, unknown>;
  };

  const absolute = resolveVaultPath(cfg, notePath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Note not found: ${notePath}`);
  }

  // Merge frontmatter with existing
  let mergedFm: Record<string, unknown> | null = null;
  if (frontmatter) {
    const existing = fs.readFileSync(absolute, "utf-8");
    const parsed = parseFrontmatter(existing);
    mergedFm = { ...(parsed.frontmatter ?? {}), ...frontmatter };
  } else {
    // Preserve existing frontmatter if no new frontmatter provided
    const existing = fs.readFileSync(absolute, "utf-8");
    const parsed = parseFrontmatter(existing);
    mergedFm = parsed.frontmatter;
  }

  const fileContent = serializeFrontmatter(mergedFm, content);
  fs.writeFileSync(absolute, fileContent, "utf-8");

  return {
    success: true,
    path: toRelativePath(cfg, absolute),
  };
});

const delete_note = wrap(async (args, cfg) => {
  const { path: notePath } = args as { path: string };
  const absolute = resolveVaultPath(cfg, notePath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Note not found: ${notePath}`);
  }

  fs.rmSync(absolute);

  return {
    success: true,
    path: toRelativePath(cfg, absolute),
  };
});

const list_notes = wrap(async (args, cfg) => {
  const { folder, recursive = false } = args as {
    folder?: string;
    recursive?: boolean;
  };

  const files = walkVault(cfg, folder, recursive);
  const notes: {
    path: string;
    title: string;
    tags: string[];
  }[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const relPath = toRelativePath(cfg, filePath);
    notes.push({
      path: relPath,
      title: extractTitle(relPath, content),
      tags: extractTags(content),
    });
  }

  return { notes, total: notes.length };
});

const get_tags = wrap(async (args, cfg) => {
  const { folder } = args as { folder?: string };
  const files = walkVault(cfg, folder);
  const tagCounts: Record<string, number> = {};

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const tags = extractTags(content);
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  return { tags: tagCounts, total: Object.keys(tagCounts).length };
});

const get_backlinks = wrap(async (args, cfg) => {
  const { note, limit = 50 } = args as { note: string; limit?: number };

  // Normalize the target: strip .md extension and folder prefixes for matching
  const noteName = note.replace(/\.md$/, "");
  const noteBaseName = path.basename(noteName);
  const noteNameLower = noteName.toLowerCase();
  const noteBaseNameLower = noteBaseName.toLowerCase();

  const files = walkVault(cfg);
  const backlinks: {
    path: string;
    context: string;
  }[] = [];

  for (const filePath of files) {
    if (backlinks.length >= limit) break;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const wikilinks = extractWikilinks(content);
    const hasLink = wikilinks.some((link) => {
      const linkLower = link.toLowerCase();
      return linkLower === noteNameLower || linkLower === noteBaseNameLower;
    });

    if (!hasLink) continue;

    // Find context around the first matching wikilink
    const lines = content.split("\n");
    let contextSnippet = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes(`[[${noteName}`) || line.includes(`[[${noteBaseName}`)) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length - 1, i + 1);
        contextSnippet = lines.slice(start, end + 1).join("\n");
        break;
      }
    }

    backlinks.push({
      path: toRelativePath(cfg, filePath),
      context: contextSnippet,
    });
  }

  return { backlinks, total: backlinks.length };
});

const get_daily_note = wrap(async (args, cfg) => {
  const { date } = args as { date?: string };

  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("Date must be in YYYY-MM-DD format");
  }

  const dailyFolder = cfg.settings["daily_notes_folder"] || "Daily Notes";
  const templatePath = cfg.settings["daily_notes_template"] || "";

  const notePath = path.join(dailyFolder, `${targetDate}.md`);
  const absolute = resolveVaultPath(cfg, notePath);

  if (fs.existsSync(absolute)) {
    // Read existing daily note
    const content = fs.readFileSync(absolute, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    return {
      path: toRelativePath(cfg, absolute),
      frontmatter,
      body,
      created: false,
    };
  }

  // Create new daily note
  const dir = path.dirname(absolute);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let fileContent: string;

  // Try to load template
  if (templatePath) {
    try {
      const templateAbsolute = resolveVaultPath(cfg, templatePath);
      const template = fs.readFileSync(templateAbsolute, "utf-8");
      // Replace {{date}} placeholder in template
      fileContent = template.replace(/\{\{date\}\}/g, targetDate);
    } catch {
      // Fall back to default template if template file not found
      fileContent = serializeFrontmatter({ date: targetDate }, `# ${targetDate}\n`);
    }
  } else {
    fileContent = serializeFrontmatter({ date: targetDate }, `# ${targetDate}\n`);
  }

  fs.writeFileSync(absolute, fileContent, "utf-8");

  const { frontmatter, body } = parseFrontmatter(fileContent);
  return {
    path: toRelativePath(cfg, absolute),
    frontmatter,
    body,
    created: true,
  };
});

// ---------------------------------------------------------------------------
// Export handlers
// ---------------------------------------------------------------------------

export const handlers: Record<string, Handler> = {
  search_notes,
  read_note,
  create_note,
  update_note,
  delete_note,
  list_notes,
  get_tags,
  get_backlinks,
  get_daily_note,
};
