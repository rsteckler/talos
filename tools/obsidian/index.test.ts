import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handlers } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function creds(overrides?: Record<string, string>): Record<string, string> {
  return { vault_path: tmpDir, ...overrides };
}

/** Shorthand for calling a handler. */
function call(name: string, args: Record<string, unknown>, credentials?: Record<string, string>) {
  return handlers[name]!(args, credentials ?? creds());
}

/** Read a file from the temp vault. */
function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");
}

/** Check if a file exists in the temp vault. */
function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(tmpDir, relativePath));
}

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

const ALPHA_CONTENT = `---
title: Project Alpha
tags:
  - project
  - active
status: in-progress
---
# Project Alpha

This is the Alpha project. See also [[Beta]] for related work.

Some notes about #planning and #review.
`;

const BETA_CONTENT = `---
title: Project Beta
tags:
  - project
  - archived
status: complete
---
# Project Beta

Beta is complete. Referenced by [[Alpha]].
`;

const SIMPLE_CONTENT = `# Simple Note

This is a simple note without frontmatter.

It has some #inline tags.
`;

const TAGGED_CONTENT = `---
tags: [design, ux]
priority: high
---
A note about #design patterns and #architecture.
`;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-test-"));

  // .obsidian/ (mimics real vault)
  fs.mkdirSync(path.join(tmpDir, ".obsidian"));

  // Projects/
  fs.mkdirSync(path.join(tmpDir, "Projects"));
  fs.writeFileSync(path.join(tmpDir, "Projects", "Alpha.md"), ALPHA_CONTENT);
  fs.writeFileSync(path.join(tmpDir, "Projects", "Beta.md"), BETA_CONTENT);

  // Daily Notes/ (empty)
  fs.mkdirSync(path.join(tmpDir, "Daily Notes"));

  // Root-level notes
  fs.writeFileSync(path.join(tmpDir, "simple.md"), SIMPLE_CONTENT);
  fs.writeFileSync(path.join(tmpDir, "tagged.md"), TAGGED_CONTENT);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe("config validation", () => {
  it("returns error when vault_path is missing", async () => {
    const result = await handlers["read_note"]!({ path: "simple" }, {});
    expect(result).toEqual({ error: expect.stringContaining("vault path is required") });
  });

  it("returns error when vault_path does not exist", async () => {
    const result = await handlers["read_note"]!(
      { path: "simple" },
      { vault_path: "/nonexistent/vault/path" },
    );
    expect(result).toEqual({ error: expect.stringContaining("does not exist") });
  });
});

// ---------------------------------------------------------------------------
// read_note
// ---------------------------------------------------------------------------

describe("read_note", () => {
  it("reads note with frontmatter", async () => {
    const result = (await call("read_note", { path: "Projects/Alpha" })) as Record<string, unknown>;
    expect(result["frontmatter"]).toEqual({
      title: "Project Alpha",
      tags: ["project", "active"],
      status: "in-progress",
    });
    expect(result["body"]).toContain("This is the Alpha project");
  });

  it("reads note without frontmatter", async () => {
    const result = (await call("read_note", { path: "simple" })) as Record<string, unknown>;
    expect(result["frontmatter"]).toBeNull();
    expect(result["body"]).toContain("# Simple Note");
  });

  it("returns tags and wikilinks", async () => {
    const result = (await call("read_note", { path: "Projects/Alpha" })) as Record<string, unknown>;
    expect(result["tags"]).toEqual(expect.arrayContaining(["planning", "review", "project", "active"]));
    expect(result["wikilinks"]).toEqual(["Beta"]);
  });

  it("returns error for non-existent note", async () => {
    const result = await call("read_note", { path: "does-not-exist" });
    expect(result).toEqual({ error: expect.stringContaining("not found") });
  });
});

// ---------------------------------------------------------------------------
// create_note
// ---------------------------------------------------------------------------

describe("create_note", () => {
  it("creates file with content and frontmatter", async () => {
    const result = (await call("create_note", {
      path: "new-note",
      content: "Hello world",
      frontmatter: { title: "New Note", draft: true },
    })) as Record<string, unknown>;

    expect(result["success"]).toBe(true);
    const onDisk = readFile("new-note.md");
    expect(onDisk).toContain("---");
    expect(onDisk).toContain("title: New Note");
    expect(onDisk).toContain("draft: true");
    expect(onDisk).toContain("Hello world");
  });

  it("auto-creates parent directories", async () => {
    await call("create_note", {
      path: "deep/nested/folder/note",
      content: "Deep note",
    });
    expect(fileExists("deep/nested/folder/note.md")).toBe(true);
  });

  it("errors if file already exists", async () => {
    const result = await call("create_note", { path: "simple", content: "overwrite" });
    expect(result).toEqual({ error: expect.stringContaining("already exists") });
  });

  it("blocks path traversal", async () => {
    const result = await call("create_note", { path: "../escape", content: "bad" });
    expect(result).toEqual({ error: expect.stringContaining("outside the vault") });
  });
});

// ---------------------------------------------------------------------------
// update_note
// ---------------------------------------------------------------------------

describe("update_note", () => {
  it("replaces body and preserves existing frontmatter", async () => {
    await call("update_note", { path: "Projects/Alpha", content: "Updated body" });

    const onDisk = readFile("Projects/Alpha.md");
    expect(onDisk).toContain("title: Project Alpha");
    expect(onDisk).toContain("Updated body");
    expect(onDisk).not.toContain("This is the Alpha project");
  });

  it("merges new frontmatter fields with existing", async () => {
    await call("update_note", {
      path: "Projects/Alpha",
      content: "Updated body",
      frontmatter: { priority: "high" },
    });

    const onDisk = readFile("Projects/Alpha.md");
    expect(onDisk).toContain("title: Project Alpha");
    expect(onDisk).toContain("priority: high");
  });

  it("overrides existing frontmatter keys", async () => {
    await call("update_note", {
      path: "Projects/Alpha",
      content: "Updated body",
      frontmatter: { status: "done" },
    });

    const onDisk = readFile("Projects/Alpha.md");
    expect(onDisk).toContain("status: done");
    expect(onDisk).not.toContain("in-progress");
  });

  it("returns error for non-existent note", async () => {
    const result = await call("update_note", { path: "nope", content: "x" });
    expect(result).toEqual({ error: expect.stringContaining("not found") });
  });
});

// ---------------------------------------------------------------------------
// delete_note
// ---------------------------------------------------------------------------

describe("delete_note", () => {
  it("deletes existing file", async () => {
    expect(fileExists("simple.md")).toBe(true);
    const result = (await call("delete_note", { path: "simple" })) as Record<string, unknown>;
    expect(result["success"]).toBe(true);
    expect(fileExists("simple.md")).toBe(false);
  });

  it("returns error for non-existent note", async () => {
    const result = await call("delete_note", { path: "ghost" });
    expect(result).toEqual({ error: expect.stringContaining("not found") });
  });
});

// ---------------------------------------------------------------------------
// list_notes
// ---------------------------------------------------------------------------

describe("list_notes", () => {
  it("lists notes in root (non-recursive)", async () => {
    const result = (await call("list_notes", {})) as { notes: { path: string }[]; total: number };
    const paths = result.notes.map((n) => n.path);
    expect(paths).toContain("simple.md");
    expect(paths).toContain("tagged.md");
    // Should NOT include nested files
    expect(paths).not.toContain("Projects/Alpha.md");
  });

  it("lists notes in subfolder", async () => {
    const result = (await call("list_notes", { folder: "Projects" })) as { notes: { path: string }[] };
    const paths = result.notes.map((n) => n.path);
    expect(paths).toContain("Projects/Alpha.md");
    expect(paths).toContain("Projects/Beta.md");
    expect(paths).not.toContain("simple.md");
  });

  it("recursive listing includes nested files", async () => {
    const result = (await call("list_notes", { recursive: true })) as { notes: { path: string }[]; total: number };
    const paths = result.notes.map((n) => n.path);
    expect(paths).toContain("simple.md");
    expect(paths).toContain("Projects/Alpha.md");
    expect(paths).toContain("Projects/Beta.md");
  });

  it("returns title and tags", async () => {
    const result = (await call("list_notes", { folder: "Projects" })) as {
      notes: { path: string; title: string; tags: string[] }[];
    };
    const alpha = result.notes.find((n) => n.path === "Projects/Alpha.md");
    expect(alpha?.title).toBe("Project Alpha");
    expect(alpha?.tags).toEqual(expect.arrayContaining(["project", "active"]));
  });
});

// ---------------------------------------------------------------------------
// search_notes
// ---------------------------------------------------------------------------

describe("search_notes", () => {
  it("finds notes matching query text", async () => {
    const result = (await call("search_notes", { query: "Alpha project" })) as {
      results: { path: string; snippet: string }[];
    };
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0]!.path).toContain("Alpha");
  });

  it("respects folder filter", async () => {
    const result = (await call("search_notes", { query: "note", folder: "Projects" })) as {
      results: { path: string }[];
    };
    for (const r of result.results) {
      expect(r.path).toMatch(/^Projects\//);
    }
  });

  it("respects tag filter", async () => {
    const result = (await call("search_notes", { query: "project", tag: "archived" })) as {
      results: { path: string }[];
    };
    // Only Beta has the "archived" tag
    expect(result.results.length).toBe(1);
    expect(result.results[0]!.path).toContain("Beta");
  });

  it("respects frontmatter field/value filter", async () => {
    const result = (await call("search_notes", {
      query: "project",
      frontmatter_field: "status",
      frontmatter_value: "complete",
    })) as { results: { path: string }[] };
    expect(result.results.length).toBe(1);
    expect(result.results[0]!.path).toContain("Beta");
  });

  it("returns context snippets around match", async () => {
    const result = (await call("search_notes", { query: "Simple Note" })) as {
      results: { snippet: string }[];
    };
    expect(result.results[0]!.snippet).toContain("Simple Note");
  });

  it("limit param caps results", async () => {
    const result = (await call("search_notes", { query: "project", limit: 1 })) as {
      results: unknown[];
      total: number;
    };
    expect(result.results.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// get_tags
// ---------------------------------------------------------------------------

describe("get_tags", () => {
  it("returns tag-to-count map across vault", async () => {
    const result = (await call("get_tags", {})) as { tags: Record<string, number>; total: number };
    expect(result.tags["project"]).toBe(2); // Alpha + Beta frontmatter
    expect(result.tags["design"]).toBeGreaterThanOrEqual(1); // tagged.md inline + frontmatter
    expect(result.total).toBeGreaterThan(0);
  });

  it("includes both inline and frontmatter tags", async () => {
    const result = (await call("get_tags", {})) as { tags: Record<string, number> };
    // Frontmatter tags from Alpha/Beta/tagged
    expect(result.tags["project"]).toBeDefined();
    expect(result.tags["active"]).toBeDefined();
    // Inline tags from Alpha body
    expect(result.tags["planning"]).toBeDefined();
    expect(result.tags["review"]).toBeDefined();
    // Inline tag from simple.md
    expect(result.tags["inline"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// get_backlinks
// ---------------------------------------------------------------------------

describe("get_backlinks", () => {
  it("finds notes linking to target via [[Target]]", async () => {
    const result = (await call("get_backlinks", { note: "Beta" })) as {
      backlinks: { path: string; context: string }[];
    };
    expect(result.backlinks.length).toBeGreaterThanOrEqual(1);
    expect(result.backlinks[0]!.path).toContain("Alpha");
  });

  it("case-insensitive matching", async () => {
    const result = (await call("get_backlinks", { note: "beta" })) as {
      backlinks: { path: string }[];
    };
    expect(result.backlinks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns context around the wikilink", async () => {
    const result = (await call("get_backlinks", { note: "Beta" })) as {
      backlinks: { context: string }[];
    };
    expect(result.backlinks[0]!.context).toContain("[[Beta]]");
  });
});

// ---------------------------------------------------------------------------
// get_daily_note
// ---------------------------------------------------------------------------

describe("get_daily_note", () => {
  it("creates daily note when it doesn't exist", async () => {
    const result = (await call("get_daily_note", { date: "2025-01-15" })) as Record<string, unknown>;
    expect(result["created"]).toBe(true);
    expect(result["path"]).toBe("Daily Notes/2025-01-15.md");
    expect(fileExists("Daily Notes/2025-01-15.md")).toBe(true);
  });

  it("returns existing daily note without creating", async () => {
    // Create it first
    await call("get_daily_note", { date: "2025-01-15" });
    // Call again
    const result = (await call("get_daily_note", { date: "2025-01-15" })) as Record<string, unknown>;
    expect(result["created"]).toBe(false);
    expect(result["path"]).toBe("Daily Notes/2025-01-15.md");
  });

  it("custom date param works", async () => {
    const result = (await call("get_daily_note", { date: "2024-12-25" })) as Record<string, unknown>;
    expect(result["created"]).toBe(true);
    expect(result["path"]).toBe("Daily Notes/2024-12-25.md");

    const onDisk = readFile("Daily Notes/2024-12-25.md");
    expect(onDisk).toContain("2024-12-25");
  });
});

// ---------------------------------------------------------------------------
// Sandbox / security
// ---------------------------------------------------------------------------

describe("sandbox / path traversal", () => {
  it("blocks path traversal on read", async () => {
    const result = await call("read_note", { path: "../../etc/passwd" });
    expect(result).toEqual({ error: expect.stringContaining("outside the vault") });
  });

  it("blocks path traversal on create", async () => {
    const result = await call("create_note", { path: "../../../tmp/evil", content: "bad" });
    expect(result).toEqual({ error: expect.stringContaining("outside the vault") });
  });
});
