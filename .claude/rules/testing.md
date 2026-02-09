# Testing (default rules for all frameworks)

### Purpose & Scope
- Test behavior, not implementation details.
- Prefer fewer, higher-signal tests over lots of brittle tests.
- Optimize for determinism, speed, and clarity.

### Test Shape
- Use Arrange → Act → Assert (AAA) (or Given/When/Then) consistently.
- One primary assertion per test (multiple asserts ok if they verify the same behavior).
- Keep tests small; avoid multi-scenario "mega tests."

### Naming & Readability
- Name tests by behavior and outcome (what/when/then).
- Avoid vague names like "should work" or "handles errors."
- Keep the test body readable; avoid clever abstractions.

### Isolation & Determinism
- Do not depend on test order.
- Avoid shared mutable state across tests.
- Reset/cleanup state between tests; prefer per-test setup over global setup when possible.
- Eliminate flakiness:
  - no arbitrary sleeps
  - avoid time/clock dependence unless explicitly controlled/mocked
  - avoid network dependence unless explicitly an integration test

### Data & Fixtures
- Prefer inline test data when it's small and clarifies intent.
- Use factories/fixtures only when reuse improves clarity and reduces duplication.
- Keep fixtures minimal; avoid "kitchen sink" objects.

### Mocking / Stubbing
- Mock at boundaries (I/O, network, filesystem, time, randomness), not in the middle of pure logic.
- Prefer fakes over deep mocks when feasible.
- Avoid mocking the thing you're trying to test.
- Assert on outputs/side effects, not internal call sequences (unless that's the behavior).

### Assertions
- Assert the most important behavior first.
- Prefer specific assertions over broad snapshots or "truthy" checks.
- When failures happen, error messages should be obvious and actionable.

### Integration vs Unit
- Be explicit about test level:
  - unit tests: fast, isolated
  - integration tests: real components, limited scope
  - e2e tests: minimal count, highest signal, highest cost
- Use the smallest test level that gives confidence for the behavior.

### Reliability & Timing
- Prefer event-driven waiting (wait for condition) over fixed delays.
- Use timeouts intentionally; keep them as low as reliability allows.
- Run tests in parallel only if isolation is guaranteed.

### Environment & Secrets
- Tests must not require real secrets.
- Use test env configs that are safe by default.
- Avoid writing to real user data or production resources.

### Failure Triage
- If a test is flaky, fix or remove it—do not "just rerun."
- When adding tests, ensure they fail for the right reason and pass reliably.

### Performance
- Keep test suites fast; avoid expensive setup in every test.
- Prefer targeted integration/e2e coverage over exhaustive UI flows.

### Maintenance
- Update tests when behavior changes; do not "paper over" failures with weaker assertions.
- Avoid overcoupling to exact formatting/wording unless that is the intended contract.
