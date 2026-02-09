# TypeScript (framework-agnostic)

### Type Safety Defaults
- Assume `strict` TypeScript. Do not weaken compiler options to "make it work."
- Avoid `any`. Prefer `unknown` + narrowing, or generics with constraints.
- Use `as` casts only as a last resort; prefer real type guards and runtime checks.
- Prefer `satisfies` over `as` when validating object shapes without widening types.
- Prefer explicit return types for exported functions and public APIs.

### Modeling Patterns
- Prefer discriminated unions over boolean flags or "stringly-typed" conditionals.
- Prefer `type` for unions/utility composition; use `interface` when you need declaration merging or an extensible object contract.
- Prefer `readonly` data where mutation isn't required; use `as const` for literal preservation.
- Avoid `enum` unless you specifically need emitted JS; prefer union literals (`'a' | 'b'`) or `as const` objects.

### Imports / Modules
- Use `import type { ... }` for type-only imports to avoid runtime side effects and keep bundles clean.
- Keep ESM/CJS consistent with the repo. Don't mix patterns without a clear reason.
- Avoid implicit "barrel" imports that create cycles; prefer direct imports when boundaries matter.

### Error-Prone Areas
- Don't use `@ts-ignore` or `@ts-nocheck`. If absolutely unavoidable, use `@ts-expect-error` with a short reason.
- Don't rely on non-null assertions (`!`) unless you can prove the invariant locally.
- Avoid broad `catch (e)` assumptions. Treat caught values as `unknown` and normalize to an `Error`.

### Public Types & Boundaries
- For any boundary that touches external input (network, filesystem, env, user input), separate:
  - runtime parsing/validation (produces safe data)
  - typed domain logic (assumes validated data)
- Avoid leaking internal types across module boundaries. Export small, stable types.

### Code Hygiene
- Prefer small, named helper types over deeply nested inline conditional types.
- Keep generics readable; if a type is hard to understand quickly, simplify it.
