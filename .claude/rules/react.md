# React (framework only)

### Component Design
- Prefer function components and hooks.
- Keep components small and responsibility-focused; split by UI responsibility, not by file count.
- Prefer composition over configuration-heavy components.
- Avoid prop drilling for deeply shared state; use existing app patterns (context/store) when appropriate.

### State & Derived Data
- Keep state minimal: store the source of truth, derive the rest.
- Do not mirror props into state unless you have a clear synchronization reason.
- Avoid storing derived values that can be computed from props/state.
- Prefer functional `setState(prev => next)` when next depends on previous.

### Rendering Performance
- Fix unnecessary re-renders by stabilizing props (memoize callbacks/objects) only when there's evidence it matters.
- Avoid premature `useMemo`/`useCallback` everywhere; use them intentionally for referential stability or expensive work.
- Avoid creating new objects/functions in render paths when passing to memoized children in hot components.

### Effects & Lifecycles
- Treat `useEffect` as a synchronization tool, not a general event handler.
- Put the right dependencies in dependency arrays; do not "cheat" them away.
- Prefer event-driven updates over effects when possible.
- Clean up subscriptions/timers in effects to prevent leaks and duplicate listeners.

### Data Fetching Boundaries
- Do not fetch in random components if the app has a standard pattern (route loader, hooks layer, query library, etc.).
- Keep async side effects in dedicated hooks/services where possible, not inside presentational components.

### Forms & Controlled Inputs
- Prefer controlled components for inputs that affect app state or validation.
- Avoid excessive re-renders in large forms; follow existing form library/pattern if present.

### Accessibility
- Use semantic elements for interaction (`button`, `a`, `input`) instead of clickable `div`s.
- Ensure focus and keyboard interaction work for custom components.
- Provide labels for form controls and meaningful alt text for images.

### Keys & Lists
- Keys must be stable and unique. Never use array index as a key unless the list is truly static and never reordered.

### Context
- Keep context values stable (memoize provider values when needed).
- Avoid putting rapidly changing values into context that forces broad re-renders.
- Prefer multiple focused contexts over one "app state" mega-context.

### Styling & UI Libraries
- Follow existing styling conventions (CSS modules, Tailwind, CSS-in-JS, etc.).
- Do not introduce a new UI/styling library unless explicitly requested.

### File/Export Hygiene
- Prefer named exports for reusable components/hooks unless the repo standard is default exports.
- Keep hooks in `useX` naming; keep components PascalCase.
