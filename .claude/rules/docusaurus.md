# Docusaurus (framework-specific rules)

### Content Organization
- Follow the project's existing structure for:
  - docs folders
  - sidebar grouping
  - versioning (if enabled)
- Place new content in the most relevant existing section; avoid creating new top-level categories unless clearly necessary.

### Sidebar Discipline
- Update sidebar configuration when adding or moving pages.
- Keep sidebar depth shallow and scannable.
- Avoid long, flat lists of pages without logical grouping.

### MDX Usage
- Prefer standard Markdown; use MDX only when interactive components add real value.
- Avoid embedding complex React logic inside documentation.
- Keep custom components simple and reusable.

### Page Structure
- Each page should include:
  - a clear title
  - a short introductory context
  - task-oriented or concept-focused sections
- Prefer smaller focused pages over very long documents.

### Links & Navigation
- Use relative links between docs; avoid hardcoded absolute URLs.
- Prefer linking to canonical pages rather than duplicating content.
- Ensure internal links remain valid when moving or renaming files.

### Versioning (if enabled)
- Add content to the correct version.
- Avoid modifying historical versions unless fixing critical errors.
- Ensure new pages are included in versioned sidebars.

### Code Blocks
- Use language-specific fenced blocks for syntax highlighting.
- Keep examples minimal and realistic.
- Avoid large, hard-to-scan code dumps.

### Assets & Media
- Place images/assets in the project's standard static location.
- Optimize images for size and clarity.
- Use diagrams only when they improve understanding.

### Build & Performance
- Avoid heavy client-side components that slow documentation load.
- Do not introduce new plugins/themes unless explicitly requested.

### Consistency
- Match existing conventions for:
  - frontmatter fields
  - sidebar labels
  - page naming and tone
- Do not introduce a new documentation structure or navigation model unless explicitly requested.
