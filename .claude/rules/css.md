# CSS

### Scope & Strategy
- Follow the existing styling approach in the project (global CSS, modules, utility-first, CSS-in-JS, etc.). Do not introduce a new styling system.
- Prefer local scoping (modules, component scope, or specific class selectors) over global styles.
- Avoid styling by element selectors unless it's part of a global reset or typography system.

### Selectors
- Keep selectors simple and shallow. Avoid deep descendant chains.
- Prefer class selectors over ids and overqualified selectors.
- Avoid high specificity and `!important` unless there is no reasonable alternative.

### Layout
- Prefer modern layout primitives:
  - Flexbox for one-dimensional layout
  - Grid for two-dimensional layout
- Avoid layout hacks (floats, absolute positioning) unless required by the existing code.
- Avoid fixed heights unless the design truly requires them.

### Responsiveness
- Use fluid layouts and relative units (`%`, `rem`, `em`, `vh/vw`) where appropriate.
- Follow existing breakpoint conventions in the project.
- Avoid hardcoding values that will break at different screen sizes.

### Maintainability
- Reuse existing variables, tokens, utilities, and design system values.
- Do not introduce new spacing, colors, or typography scales unless necessary.
- Keep rules focused and cohesive; avoid large "catch-all" style blocks.

### Performance
- Avoid overly complex selectors that are expensive to evaluate.
- Do not trigger unnecessary layout or paint issues (e.g., excessive use of `position: fixed`, heavy box shadows, large blur filters).

### State & Interaction
- Prefer class-based state (`.is-active`, `.disabled`, etc.) over inline style manipulation.
- Ensure hover/focus/active states exist where interaction is expected.
- Never remove focus visibility without providing a clear alternative.

### Consistency
- Match the project's naming conventions and file organization.
- Do not reformat or reorganize unrelated styles.
