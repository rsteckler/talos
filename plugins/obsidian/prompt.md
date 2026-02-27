# Obsidian Vault

Read, write, search, and navigate an Obsidian vault on the local filesystem.


## Notes

** Important **  obsidian_search_for_snippet uses OR matching — a note matches if **any** of the query terms appear in it. Results are ranked by how many terms match (best matches first). Use multiple descriptive terms to surface the most relevant notes (e.g. "los angeles hotel vacation" will find notes containing any of those words, with notes containing more of them ranked higher).

- `obsidian_search_for_snippet` — Search the vault. Returns **note IDs with short preview snippets** (not full content). Use `read_note` to get the complete note. **Uses OR matching**: any term in the query can match, and results are ranked by number of matching terms. Optional filters: `folder`, `tag`, `frontmatter_field`/`frontmatter_value`. Use `limit` to cap results.
- `obsidian_read_note` — Read a note by path/noteId. Returns parsed frontmatter (object), body content, tags, and wikilinks separately. Path is relative to vault root; `.md` extension is optional.
- `obsidian_create_note` — Create a new note. `path` and `content` required. Optional `frontmatter` object is serialized as YAML. Auto-creates parent folders. Errors if file already exists.
- `obsidian_update_note` — Update an existing note. `content` replaces the body. `frontmatter` fields are merged with existing frontmatter (existing fields not specified are preserved).
- `obsidian_delete_note` — Delete a note by path.

## Search → Read Pattern

**`obsidian_search_for_snippet` returns note IDs and short preview snippets — NOT full note content.** To get the actual content of a note, you MUST follow up with `obsidian_read_note` using the `noteId` from the search results.

Correct workflow:
1. `search_for_snippet` → find matching notes (returns noteId + short snippet)
2. `read_note` with the noteId → get full note content
3. Process the full content as needed

Do NOT try to extract detailed information from search snippets — they are only 2-3 lines of context around the match. Always call `read_note` to get the full picture.

## Discovery

- `obsidian_list_notes` — List notes in a folder. Returns paths, titles, and tags. Use `recursive: true` to include subfolders. Defaults to vault root.
- `obsidian_get_tags` — Scan the vault for all tags (inline `#tags` and frontmatter `tags:` arrays). Returns a tag-to-count map. Optional `folder` filter.
- `obsidian_get_backlinks` — Find all notes containing `[[wikilinks]]` pointing to a given note. Returns linking note paths with surrounding context.

## Daily Notes

- `obsidian_get_daily_note` — Read or create a daily note. Uses `YYYY-MM-DD.md` naming in the configured daily notes folder. If the note doesn't exist, creates it with a date-stamped template. Optional `date` param (defaults to today).

## Usage Tips

- **Always search first**: Use `obsidian_search_for_snippet` or `obsidian_list_notes` before assuming a note exists or guessing its path.
- **Search then read**: `search_for_snippet` only returns previews. Always follow with `read_note` to get full content before extracting specific information.
- **Discover taxonomy**: Use `obsidian_get_tags` to understand the user's tag system before creating notes with tags.
- **Match patterns**: When creating notes, match the user's existing frontmatter fields and folder structure.
- **Understand relationships**: Use `obsidian_get_backlinks` to see how notes connect before suggesting changes.
- **Prefer update over recreate**: Use `obsidian_update_note` to modify existing notes rather than deleting and recreating.
- **Daily notes**: Always use `obsidian_get_daily_note` — it handles creation if the note doesn't exist.
- **Paths**: All paths are relative to the vault root. The `.md` extension is optional.
