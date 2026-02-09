# Tailwind CSS (addon only)

### Utility-First Defaults
- Prefer Tailwind utilities over bespoke CSS when Tailwind is the chosen system.
- Do not add new custom CSS classes for things Tailwind can express cleanly.
- If a style repeats often, prefer extracting with existing patterns:
  - `@apply` only if the project already uses it
  - otherwise use component-level abstractions (shared components), not global "utility" classes.

### Class Organization
- Keep class lists readable:
  - group by concern (layout → spacing → typography → colors → effects → state)
  - avoid random ordering
- Avoid duplicative/conflicting utilities (e.g., multiple `p-*` or `text-*` fighting each other) unless intentional.

### Responsiveness
- Use existing breakpoint conventions.
- Start mobile-first; add responsive variants only where needed.
- Avoid sprinkling many breakpoints on a single element unless it's truly required.

### States & Variants
- Use Tailwind variants (`hover:`, `focus:`, `disabled:`, `group-hover:`, etc.) instead of custom CSS.
- Preserve visible focus styles; use `focus-visible:` patterns when appropriate.
- Prefer `aria-*` / `data-*` variant patterns only if the project already uses them.

### Theming & Tokens
- Prefer project tokens (theme colors, spacing scale) over arbitrary values.
- Avoid arbitrary values (`[... ]`) unless there's no suitable token.
- Do not introduce new colors/sizing scales unless explicitly requested.

### Layout Patterns
- Prefer `flex`/`grid` utilities over manual positioning hacks.
- Avoid fixed heights/widths unless necessary; prefer responsive sizing (`w-full`, `max-w-*`, etc.).

### Composition & Reuse
- Prefer building reusable UI via components rather than copying large Tailwind class strings everywhere.
- If a class list becomes unwieldy, follow the project's established approach (e.g., `clsx`, `cva`, `tailwind-merge`)—do not introduce a new one.

### Consistency
- Match the repo's Tailwind conventions (plugins, typography/forms, container strategy).
- Do not change Tailwind config unless explicitly requested.
