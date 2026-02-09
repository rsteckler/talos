# pnpm (package manager rules)

### Workspace & Lockfile Discipline
- Treat `pnpm-lock.yaml` as authoritative; do not hand-edit it.
- Avoid unnecessary lockfile churn:
  - only update deps when required by the change
  - don't "upgrade everything" unless explicitly requested
- Keep workspace boundaries clean; avoid implicit cross-package coupling.

### Installing & Adding Dependencies
- Prefer `pnpm add` / `pnpm add -D` (or the repo's established patterns) rather than editing package.json manually.
- Add deps at the narrowest correct scope (package-level vs workspace root).
- Avoid adding new dependencies unless there's a clear need.

### Scripts & Filtering
- Use `pnpm -r` / `--filter` for targeted runs in monorepos.
- Prefer repo-standard scripts (e.g., `pnpm lint`, `pnpm build`) over ad-hoc commands.

### Hoisting & Node Resolution
- Do not change hoisting settings (`node-linker`, `shamefully-hoist`, `public-hoist-pattern`) unless explicitly requested.
- Assume pnpm's strictness will surface missing peer deps; fix correctly rather than masking via hoisting.

### Peer Dependencies
- Respect peer dependency warnings; resolve them intentionally.
- Avoid "papering over" peers with broad version ranges unless that matches repo convention.

### Patches & Overrides
- Use `pnpm.overrides` only when necessary (security fixes, pinning broken transitive deps).
- Keep overrides minimal and well-scoped; avoid long-lived overrides without a clear reason.

### Reproducibility
- Prefer `pnpm install --frozen-lockfile` in CI contexts (if that's the repo convention).
- Avoid commands that produce non-deterministic installs.

### Node Version Alignment
- Respect repo constraints (`engines`, `.nvmrc`, `.tool-versions`, Volta, etc.).
- Avoid bumping Node/pnpm versions unless explicitly requested.

### Publishing (if applicable)
- Follow existing workspace publishing conventions (`changesets`, tags, versioning).
- Avoid introducing a new release tool or version strategy unless explicitly requested.
