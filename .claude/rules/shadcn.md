# shadcn/ui (addon only)

### Component Philosophy
- Treat shadcn components as **project-owned code**, not a third-party black box.
- Prefer modifying the generated component locally when behavior or styling needs to change.
- Do not wrap components unnecessarily if a small local change is clearer.

### Composition
- Prefer composition of primitives over creating large custom wrappers.
- Keep usage close to the intended Radix + Tailwind patterns.
- Avoid creating alternative abstractions that hide the underlying component structure.

### Styling
- Use Tailwind utilities for customization.
- Prefer extending class names via `className` rather than modifying component internals when changes are small.
- Use the existing `cn()` utility (or project equivalent) for class merging.
- Avoid inline styles unless there is no Tailwind equivalent.

### Variants
- Follow the existing variant pattern (often using `class-variance-authority` / `cva` if present).
- Prefer adding variants to the component rather than creating multiple near-duplicate components.
- Keep variant logic simple and predictable.

### Theming & Tokens
- Use existing design tokens (Tailwind config, CSS variables).
- Avoid introducing new colors, spacing, or typography scales unless explicitly requested.
- Follow existing dark mode patterns if present.

### Radix Behavior
- Preserve accessibility and interaction behavior provided by Radix primitives.
- Do not remove required structure, roles, or focus management.
- When modifying behavior, keep the expected keyboard and focus behavior intact.

### File Organization
- Keep components in the existing `components/ui` (or project) structure.
- Do not regenerate or overwrite components unless explicitly requested.
- Avoid mixing multiple versions or alternate implementations of the same component.

### Consistency
- Match existing usage patterns across the project.
- Do not introduce additional UI libraries alongside shadcn unless explicitly requested.
