# Zustand (addon only)

### When to Use Zustand
- Use Zustand for shared client state that doesn't justify Redux-level structure.
- Keep local UI state in components unless multiple distant components truly need it.

### Store Design
- Prefer multiple small stores (by domain/feature) over one global mega-store.
- Keep store shape flat and simple; avoid deeply nested objects that are hard to update immutably.
- Define clear "actions" on the store for all mutations; avoid ad-hoc `set` scattered across the codebase.

### Selectors & Rerenders
- Always select the smallest slice of state needed in components.
- Prefer selector functions over reading the whole store.
- Use `shallow` comparison when selecting objects/arrays to reduce unnecessary rerenders (when the project already uses it).

### Derived State
- Prefer deriving values in selectors rather than storing redundant/derived fields.
- If derived values are expensive, compute via memoized selectors (or project pattern) rather than persisting duplicated state.

### Async & Side Effects
- Keep async actions inside store actions or dedicated service functions, consistent with the project.
- Handle in-flight / error state explicitly if the store owns the async workflow.
- Avoid mixing network-fetch caching into Zustand unless the project explicitly uses it that way.

### Persistence & Middleware
- Use middleware (`persist`, `subscribeWithSelector`, etc.) only when needed and consistent with the project.
- When persisting, whitelist specific fields; avoid persisting volatile or sensitive state.

### Immutability & Updates
- For object updates, prefer functional updates (`set(state => ...)`) when next depends on previous.
- Avoid mutating nested objects in place unless you're using an Immer middleware and it's the established pattern.

### Testing/Debuggability Considerations
- Keep actions named and deterministic so devtools traces are meaningful (if devtools middleware is used).
- Avoid storing non-serializable values unless required (DOM nodes, class instances, etc.).

### Consistency
- Match existing conventions for store naming (`useXStore`), file layout, and exports.
- Do not introduce new middleware patterns unless explicitly requested.
