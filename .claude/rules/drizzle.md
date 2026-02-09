# Drizzle (SQL ORM) (ORM only)

### Schema as Source of Truth
- Treat the Drizzle schema as the canonical representation of database structure.
- Keep table definitions explicit and strongly typed.
- Avoid duplicating model types elsewhere; use Drizzle-inferred types (`InferModel` / `$inferSelect` / `$inferInsert`).

### Migrations
- Use Drizzle's migration tooling consistently (drizzle-kit or project equivalent).
- Keep migrations small and incremental.
- Avoid manual schema changes outside the migration workflow.

### Query Discipline
- Prefer the typed query builder over raw SQL when possible.
- Select only required fields; avoid full-row selection by default.
- Keep queries explicit and readable; avoid overly dynamic query construction.

### Raw SQL
- Use `sql`` only when necessary (complex joins, DB-specific features).
- Keep raw SQL localized and parameterized; avoid string concatenation.
- Do not mix raw SQL and builder patterns within the same query unless necessary.

### Transactions
- Use transactions for multi-step writes that must be atomic.
- Keep transaction scopes short and free of external/network calls.
- Pass the transaction client explicitly to all operations inside the transaction.

### Relations & Joins
- Prefer explicit joins over implicit loading patterns.
- Avoid building deep, multi-join queries unless required for a specific access pattern.
- Keep result shapes predictable and small.

### Performance
- Avoid per-row operations in loops; prefer set-based queries.
- Be mindful of N+1 patterns when issuing sequential queries.
- Ensure query shapes align with indexed access patterns (indexes handled elsewhere).

### Consistency
- Match existing project conventions for:
  - schema organization
  - database client initialization
  - query location (repositories/services)
- Avoid introducing alternative data-access patterns alongside Drizzle unless explicitly requested.
