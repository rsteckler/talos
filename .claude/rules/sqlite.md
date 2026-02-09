# SQLite (database only)

### When SQLite Fits
- Treat SQLite as an embedded database optimized for local storage and simplicity.
- Be mindful of concurrency: great for many readers / fewer writers; heavy concurrent writes require careful design.

### Schema & Modeling
- Use explicit schemas and constraints (`PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `CHECK`, `FOREIGN KEY`).
- Ensure foreign keys are enabled (SQLite supports them but they may be off depending on configuration).
- Keep schemas simple and stable; avoid over-normalization that creates excessive joins if performance matters.

### Migrations
- Keep migrations small and additive when possible.
- Be cautious with schema changes: some ALTER operations are limited and may require table rebuild patterns.
- Prefer creating new tables/columns and backfilling over destructive changes.

### Transactions & Locking
- Use transactions for multi-step writes; keep transactions short.
- Understand SQLite locking modes:
  - long write transactions can block readers depending on journal mode
- Prefer WAL mode when supported/appropriate to improve read/write concurrency.

### Indexing
- Add indexes based on actual query patterns.
- Avoid over-indexing—indexes increase write cost and database size.
- Use composite indexes when queries filter on multiple columns in a stable order.

### Query & Performance
- Prefer set-based operations over row-by-row loops.
- Use `EXPLAIN QUERY PLAN` to understand slow queries.
- Avoid selecting unnecessary columns; fetch only what's needed.

### File & Durability Considerations
- SQLite is a single file: be mindful of filesystem behavior (network filesystems can be risky).
- Choose durability settings intentionally (synchronous level, journal mode) based on product requirements.
- Avoid multiple processes writing to the same DB file unless the design explicitly supports it.

### Data Integrity
- Rely on constraints where possible; treat the DB as the final gatekeeper.
- Validate and parameterize all queries to prevent injection (even locally, it matters).

### Backups
- Back up using SQLite-safe approaches (online backup API or proper file copy strategy for the chosen journal mode).
- Verify restores for real recovery confidence.

### Limits & Pitfalls
- Watch for large blobs and unbounded table growth in embedded contexts.
- Be explicit about text collation/ordering expectations if cross-platform determinism matters.

### Security
- Store the DB file in an appropriate location with correct permissions.
- Do not store secrets in plaintext inside the DB unless the threat model allows it; consider OS keychain/secure storage patterns when needed.
