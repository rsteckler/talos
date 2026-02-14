# Obsidian Vault

Read, write, search, and navigate an Obsidian vault on the local filesystem.

## Notes

- `obsidian_search_notes` — Full-text search across the vault. Optional filters: `folder`, `tag`, `frontmatter_field`/`frontmatter_value`. Returns paths with context snippets. Use `limit` to cap results.
- `obsidian_read_note` — Read a note by path. Returns parsed frontmatter (object), body content, tags, and wikilinks separately. Path is relative to vault root; `.md` extension is optional.
- `obsidian_create_note` — Create a new note. `path` and `content` required. Optional `frontmatter` object is serialized as YAML. Auto-creates parent folders. Errors if file already exists.
- `obsidian_update_note` — Update an existing note. `content` replaces the body. `frontmatter` fields are merged with existing frontmatter (existing fields not specified are preserved).
- `obsidian_delete_note` — Delete a note by path.

## Discovery

- `obsidian_list_notes` — List notes in a folder. Returns paths, titles, and tags. Use `recursive: true` to include subfolders. Defaults to vault root.
- `obsidian_get_tags` — Scan the vault for all tags (inline `#tags` and frontmatter `tags:` arrays). Returns a tag-to-count map. Optional `folder` filter.
- `obsidian_get_backlinks` — Find all notes containing `[[wikilinks]]` pointing to a given note. Returns linking note paths with surrounding context.

## Daily Notes

- `obsidian_get_daily_note` — Read or create a daily note. Uses `YYYY-MM-DD.md` naming in the configured daily notes folder. If the note doesn't exist, creates it with a date-stamped template. Optional `date` param (defaults to today).

## Obsidian Conventions

### Frontmatter
Notes can have YAML frontmatter between `---` fences at the top:
```
---
title: Meeting Notes
tags: [meeting, project-alpha]
date: 2025-01-15
status: active
---
```

Common fields: `title`, `tags`, `aliases`, `date`, `created`, `modified`, `status`, `type`, `project`.

### Wikilinks
- `[[Note Name]]` — link to another note
- `[[Note Name|display text]]` — link with custom display text
- `[[Note Name#heading]]` — link to a specific heading

### Tags
- Inline: `#tag`, `#tag/subtag` (nested tags with `/`)
- In frontmatter: `tags: [tag1, tag2]` or `tags:` followed by `- tag1` lines
- Tags are case-insensitive for search purposes

### Folder Conventions
Vaults may use flat structure or nested folders. Common patterns:
- Topic folders: `Projects/`, `Areas/`, `Resources/`, `Archive/` (PARA method)
- MOC (Map of Content): index notes that link to related notes
- Daily notes in a dedicated folder (default: `Daily Notes/`)

## Usage Tips

- **Always search first**: Use `obsidian_search_notes` or `obsidian_list_notes` before assuming a note exists or guessing its path.
- **Discover taxonomy**: Use `obsidian_get_tags` to understand the user's tag system before creating notes with tags.
- **Match patterns**: When creating notes, match the user's existing frontmatter fields and folder structure.
- **Understand relationships**: Use `obsidian_get_backlinks` to see how notes connect before suggesting changes.
- **Prefer update over recreate**: Use `obsidian_update_note` to modify existing notes rather than deleting and recreating.
- **Daily notes**: Always use `obsidian_get_daily_note` — it handles creation if the note doesn't exist.
- **Paths**: All paths are relative to the vault root. The `.md` extension is optional.
