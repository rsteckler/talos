# HTML

### Structure & Semantics
- Prefer semantic HTML elements (`header`, `main`, `nav`, `section`, `article`, `button`, etc.) over generic `div`/`span`.
- Use the simplest structure that accurately represents the content and interaction.
- Avoid unnecessary nesting or wrapper elements.
- Keep document structure logical and predictable.

### Accessibility (a11y)
- Always use native elements for interaction (`button`, `a`, `input`) instead of clickable `div`s.
- Include accessible labels for form controls (`label`, `aria-label`, or `aria-labelledby`).
- Provide meaningful `alt` text for images; use empty `alt=""` only for decorative images.
- Ensure interactive elements are keyboard accessible.
- Do not remove focus outlines unless replaced with a visible alternative.

### Forms & Inputs
- Use appropriate input types (`email`, `number`, `date`, etc.) for built-in validation and mobile UX.
- Associate labels with inputs using `for` and `id`.
- Avoid relying solely on placeholder text for field meaning.

### Attributes & Safety
- Escape or sanitize any user-provided content before rendering.
- Avoid inline event handlers (`onclick`, etc.); prefer separation of structure and behavior.
- Avoid inline styles unless required by the existing project pattern.

### Performance & Maintainability
- Prefer simple, static markup over dynamically generated structure when possible.
- Avoid large DOM trees or deeply nested layouts without need.
- Keep class and id usage minimal and purposeful.

### Consistency
- Follow the existing formatting and attribute conventions in the project.
- Keep attribute ordering and casing consistent with the codebase.
