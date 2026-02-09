# Jest (framework-specific rules)

### Setup & Isolation
- Prefer `beforeEach`/`afterEach` over `beforeAll`/`afterAll` unless setup is truly immutable.
- Use `jest.resetAllMocks()` / `jest.clearAllMocks()` consistently (match existing repo convention).
- Avoid relying on Jest's shared module cache; use `jest.resetModules()` only when you truly need a clean import graph.

### Mocking
- Prefer `jest.mock()` at module boundaries; avoid deep mocking internal functions.
- Avoid hoist surprises: keep `jest.mock()` calls at the top-level (not inside tests) unless using `jest.doMock()` intentionally.
- Use `jest.spyOn()` for partial mocking; always restore spies when the suite expects isolation.

### Timers & Time
- Prefer real timers unless you are explicitly testing time-based behavior.
- If using fake timers:
  - keep usage localized to a describe block
  - advance time explicitly (`jest.advanceTimersByTime`, `runOnlyPendingTimers`)
  - restore real timers after (`jest.useRealTimers()`)

### Async Tests
- Always `await` async work; avoid mixing `done` callbacks with async/await.
- Prefer `expect(...).resolves` / `expect(...).rejects` when it improves readability.

### Snapshots
- Use snapshots sparingly and only for stable, intentional contracts.
- Avoid snapshotting huge objects or entire rendered trees when targeted assertions are clearer.
- When updating snapshots, confirm the change is intended—don't blindly accept.

### Module System Notes
- Be consistent with ESM/CJS handling per project setup; don't introduce a new transform strategy.
- Avoid adding new Babel/Jest transformers unless explicitly requested.

### Performance
- Avoid expensive global setup in `setupFilesAfterEnv` unless it benefits most tests.
- Prefer targeted mocks in the test file over global mocks that affect unrelated suites.
