# Documentation (default rules)

### Purpose
- Documentation should help a reader:
  - understand what the system does
  - know how to use it
  - know how to work on it
- Optimize for clarity and usefulness, not completeness for its own sake.

### Audience Awareness
- Write for the intended audience:
  - **Users**: how to install, configure, and use
  - **Developers**: architecture, setup, conventions, workflows
- Avoid mixing audiences in the same section unless the project already does so.

### Structure & Navigation
- Organize content so readers can scan quickly:
  - clear headings
  - short sections
  - logical hierarchy
- Prefer task-oriented structure ("How to…") over long narrative text.
- Avoid deep nesting or long pages without clear sections.

### Keep It Close to Reality
- Documentation must reflect current behavior.
- When behavior changes, update docs rather than adding notes like "may be outdated."
- Remove obsolete content instead of accumulating warnings.

### Conciseness & Clarity
- Use simple, direct language.
- Prefer examples over long explanations.
- Avoid repetition; link to canonical sections instead.

### Code & Commands
- Ensure examples are realistic and runnable when possible.
- Keep snippets minimal and focused on the concept.
- Avoid placeholder-heavy or abstract examples that don't reflect real usage.

### Source of Truth
- Each concept should have a single authoritative location.
- Avoid duplicating the same instructions across multiple files.

### Version & Environment Assumptions
- Be explicit about prerequisites, versions, and environment expectations when relevant.
- Avoid hidden assumptions about tools, OS, or setup.

### Formatting Conventions
- Use consistent:
  - heading levels
  - code block languages
  - terminology
- Prefer lists and tables for scannability.

### Diagrams & Architecture (when used)
- Prefer simple diagrams that explain system boundaries and data flow.
- Keep diagrams high-level and easy to maintain.

### Security & Safety
- Never include secrets, tokens, private URLs, or internal credentials.
- Avoid documenting insecure practices unless clearly marked as unsafe/for development only.

### Maintenance Discipline
- Treat documentation as part of the product/codebase.
- Update or remove docs when features are added, changed, or removed.
- Avoid creating large new documents unless the information cannot fit naturally into existing structure.
