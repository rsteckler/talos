# Express (Node.js) (framework only)

### App Structure
- Keep `app`/server setup thin; put route logic in routers and business logic in service modules (follow existing project structure).
- Use `express.Router()` for feature/module routing; avoid one giant routes file.

### Middleware Discipline
- Order matters: keep middleware ordering intentional and minimal.
- Keep middleware single-purpose (auth, validation, logging, rate-limit, etc.).
- Prefer reusable middleware over repeating checks inside handlers.

### Request/Response Handling
- Always end the request lifecycle: return a response on all paths.
- Use consistent status codes and response shapes based on existing conventions.
- Avoid sending raw errors to clients; map to safe error responses.

### Async Handler Safety
- Ensure async route handlers propagate errors to the error middleware:
  - use a project-standard wrapper or pattern to forward rejected promises
- Never leave unhandled promise rejections in request handlers.

### Error Handling
- Use centralized error middleware as the final handler.
- Normalize errors into a consistent shape (status, code, message) per project conventions.
- Avoid throwing inside middleware without forwarding to `next(err)` (unless project uses async wrappers).

### Input Validation
- Validate request inputs at the edge (params, query, body) before business logic runs.
- Keep validation separate from domain logic; follow existing validation library/pattern.

### Routing Patterns
- Avoid route handlers with too many responsibilities.
- Prefer clear route naming and HTTP semantics (GET/POST/PUT/PATCH/DELETE).
- Avoid "RPC over POST" patterns unless the project already uses them.

### Security Defaults (Express-specific)
- Follow existing security middleware patterns (e.g., `helmet`, CORS config, cookie settings).
- Keep CORS configuration explicit and least-privilege.
- Do not add new security middleware/config changes unless explicitly requested.

### Streaming & File Handling
- Prefer streaming responses for large payloads/files.
- Do not buffer large uploads/downloads into memory.

### Observability Hooks (Express-specific)
- If the project uses request IDs / correlation IDs, ensure they are set early and propagated.
- Avoid logging full request bodies by default; follow existing logging conventions.

### Consistency
- Match existing conventions for route layout, middleware naming, and error response format.
- Do not introduce a new server framework or routing abstraction unless explicitly requested.
