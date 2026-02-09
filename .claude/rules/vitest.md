# Vitest (framework-specific rules)

### Setup & Isolation
- Prefer `beforeEach`/`afterEach` over `beforeAll`/`afterAll` unless setup is truly immutable.
- Reset mocks consistently (match repo convention):
  - use `vi.clearAllMocks()` and/or `vi.resetAllMocks()` as appropriate
- Avoid relying on shared module state; use `vi.resetModules()` only when a fresh import graph is required.

### Mocking
- Prefer `vi.mock()` at module boundaries; avoid deep mocking internal functions.
- Be mindful of mock hoisting: define `vi.mock()` at the top-level unless intentionally using dynamic mocking.
- Prefer `vi.spyOn()` for partial mocks; restore spies when needed for isolation.

### Timers & Time
- Use real timers by default.
- If using fake timers:
  - keep usage localized
  - advance time explicitly (`vi.advanceTimersByTime`, `vi.runOnlyPendingTimers`)
  - restore real timers after (`vi.useRealTimers()`)

### Async Tests
- Always `await` async work; avoid callback-style `done`.
- Prefer `expect(...).resolves` / `expect(...).rejects` when it reads better.

### Snapshots
- Use snapshots sparingly for stable contracts.
- Avoid snapshotting large structures when targeted assertions are clearer.
- Review snapshot updates intentionally.

### ESM / Tooling Alignment
- Lean into the project's Vite/ESM setup; avoid introducing Jest-like transform complexity.
- Avoid adding new Vite plugins/test environment changes unless explicitly requested.

### Performance
- Prefer per-file mocks over global test setup that impacts unrelated suites.
- Use `describe` scoping to keep heavy setup localized.
