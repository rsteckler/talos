# AI Policies & Permissions

---

## AI Permission Required: Installing Packages

You must **ask for permission before installing or adding any dependency**.

### Rule
Before installing packages:
1. Explain **which package(s)** will be installed.
2. Explain **why they are needed**.
3. Mention:
   - added complexity
   - security or maintenance considerations
   - bundle size or performance impact (if relevant)
4. Ask for explicit approval.

Do not install dependencies unless the user confirms.

### After Approval
- Install only the approved packages.
- Use the project's package manager.
- Avoid unnecessary transitive additions.

### Default Behavior
Prefer:
- existing project dependencies
- native/platform capabilities
- simple implementations over new libraries

Dependency changes affect long-term maintenance and must be intentional.

---

## AI Permission Required: Running the App or Server

You must **ask before starting any application, development server, or runtime process**.

### Rule
Before running anything:
1. Explain:
   - what command will run
   - why execution is needed
   - whether it starts a long-running process
   - expected resource or port usage
2. Ask for explicit approval.

Do not run the process unless the user confirms.

### After Approval
- Run only the specified command.
- Report:
  - URLs, ports, or endpoints
  - key logs or errors

### Default Behavior
If execution is only for validation, prefer:
- static analysis
- code inspection
- asking the user to run it instead

Runtime processes affect system state and must be user-approved.

---

## AI Permission Required: Updating CI Configuration

You must **ask before creating or modifying any CI/CD configuration**.

### Rule
Before changing CI:
1. Explain:
   - which files will change
   - what the workflow change does
   - why it is necessary
2. Highlight risks:
   - permission changes
   - build time or cost impact
   - deployment or release effects
3. Ask for explicit approval.

Do not modify CI unless approved.

### After Approval
- Apply only the described changes.
- Do not modify unrelated workflows.
- Summarize what changed.

CI controls automation, execution, and deployment and must be explicitly authorized.

---

## AI Permission Required: Modifying Deployment or Infrastructure

You must **ask before changing any deployment or infrastructure configuration**.

### Rule
Before making changes:
1. Specify:
   - affected files or systems
   - what behavior will change
   - why the change is needed
2. Describe potential impact:
   - downtime
   - cost
   - scaling or environment effects
3. Ask for explicit approval.

Do not proceed without confirmation.

### After Approval
- Modify only the approved configuration.
- Confirm exactly what changed.

Deployment configuration affects production behavior and requires explicit consent.

---

## AI Restriction: Do Not Make Auth / Security-Sensitive Changes

You must **never modify authentication or security-sensitive code** without explicit human approval.

### Absolute Rule
- You are **not permitted** to autonomously change auth or security-related code.
- This includes:
  - authentication flows (login, logout, session management)
  - authorization logic (roles, permissions, access control)
  - password hashing or credential handling
  - token generation, validation, or refresh logic
  - OAuth / SSO configuration
  - API key or secret management
  - encryption or cryptographic operations
  - CORS, CSP, or other security headers
  - rate limiting or abuse prevention
  - input sanitization related to security (XSS, SQL injection, etc.)

### Required Behavior Instead
If a change touches auth or security-sensitive code:
1. **Do not make the change.**
2. Clearly explain:
   - what needs to change and why
   - the security implications of the change
   - any risks or potential vulnerabilities introduced
3. Provide the exact code diff or steps for the human to review and apply.
4. Wait for explicit human approval before proceeding.

### Safety Principle
Auth and security changes are **human-controlled operations**.
When such changes are required, your role is to **propose and explain, not execute**.

---

## Check Policy: Run After Meaningful Changes

You should run linting, tests, and typechecking **after meaningful changes**.

### What Counts as Meaningful
Run checks when changes:
- modify logic or behavior
- affect multiple files or modules
- change public APIs or data structures
- add or remove dependencies
- alter configuration that impacts runtime or build

Do **not** run checks for:
- small formatting or comment-only changes
- minor refactors with no behavioral impact
- exploratory or partial edits still in progress

### Scope of Checks
Run the project's standard validation:
- lint
- tests
- typecheck
- coverage (if part of the normal workflow)

### Behavior
- Run checks once per meaningful change batch, not after every small edit.
- Summarize failures concisely and focus on actionable issues.
- Do not repeatedly rerun checks unless fixes were made.

### Principle
Balance safety with speed: validate behavior changes without slowing iteration.

---

## Git Policy: Commit Autonomously, Push Only When Approved

You may create commits as needed, but you must **never push unless the user explicitly asks**.

### Commit Behavior
Create commits when:
- a logical unit of work is complete
- changes are stable and coherent
- a meaningful milestone is reached

Commit guidelines:
- Keep commits small and focused.
- Use clear, descriptive messages.
- Avoid committing broken or partial work.

### Push Behavior
- Do **not** run `git push` unless explicitly requested.
- When asked to push:
  - confirm the branch
  - summarize commits being pushed
  - then push.

### Principle
Local commits support safe iteration. Remote pushes remain an explicit user decision.

---

## Documentation Policy: Update When Behavior Changes

You should update documentation and planning artifacts **when changes alter system behavior, usage, or architecture**.

### When to Update
Update relevant documentation when changes affect:
- public APIs or interfaces
- configuration or environment requirements
- setup, installation, or usage steps
- user-visible behavior
- architecture, data flow, or system structure
- important conventions or workflows

### What to Avoid
Do not update documentation for:
- internal refactors with no external impact
- formatting or minor code cleanup
- speculative or future behavior

### Update Guidelines
- Modify only the sections impacted by the change.
- Keep updates concise and factual.
- Ensure documentation reflects the current state of the system.
- Do not expand scope beyond the actual change.

### Principle
Documentation should stay accurate and aligned with real system behavior, without unnecessary churn.

---

## Uncertainty Policy: Ask One Question, Then Proceed

When requirements are unclear, you should **ask the single most important clarification question**, then proceed with reasonable assumptions.

### Behavior
1. Identify the **highest-impact unknown**.
2. Ask one concise question.
3. Proceed using sensible defaults and clearly stated assumptions.

### Assumptions
- Prefer common conventions and project patterns.
- Avoid large architectural changes based on assumptions.
- Keep changes conservative and easy to adjust.

### Communication
- State key assumptions briefly.
- Be ready to revise if the user provides clarification.

### Principle
Minimize interruption while reducing the risk of major misalignment.
