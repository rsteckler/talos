# Self-Hosted / Docker (deployment target rules)

### Mental Model
- Treat containers as **immutable, disposable runtime units**.
- Optimize for reproducible builds, minimal images, and predictable runtime behavior.
- Assume the environment is controlled by you; enforce your own reliability, security, and observability.

### Image Design
- Use minimal base images (alpine/distroless/slim) where compatible.
- Build images deterministically:
  - pin base image versions
  - avoid `latest`
- Keep images small:
  - multi-stage builds
  - remove build tools and caches
- Do not bake environment-specific config or secrets into the image.

### Configuration & Secrets
- Pass configuration via environment variables or mounted config.
- Store secrets outside the image (env injection, secret files, secret managers).
- Never commit secrets or hardcode credentials in Dockerfiles.

### Build Discipline
- Optimize Docker layer caching:
  - install dependencies before copying frequently changing code
- Avoid unnecessary rebuild triggers.
- Ensure builds are reproducible locally and in CI.

### Runtime Behavior
- Containers must be stateless; persist data via external volumes/services.
- Ensure the process runs in the foreground (PID 1).
- Handle signals correctly for graceful shutdown.

### Networking
- Use explicit ports and internal networking between services.
- Avoid exposing unnecessary ports publicly.
- Prefer internal service names over hardcoded IPs.

### Volumes & Persistence
- Mount volumes only where persistence is required.
- Avoid writing application state to the container filesystem.
- Ensure permissions and paths are predictable across environments.

### Health & Reliability
- Define health checks for long-running services.
- Ensure containers fail fast on startup errors.
- Use restart policies or orchestration (Docker Compose, systemd, Kubernetes, etc.) per project setup.

### Resource Limits
- Set CPU and memory limits where the deployment platform supports them.
- Avoid unbounded resource usage.

### Logging
- Log to stdout/stderr; let the host/orchestrator handle log collection.
- Avoid writing logs to local files inside the container.

### Image Distribution
- Use a versioned tagging strategy (no `latest` for production).
- Treat images as immutable artifacts.

### Security
- Run containers as non-root where possible.
- Avoid unnecessary packages, shells, or debugging tools in production images.
- Keep base images updated to receive security patches.

### Docker Compose (if used)
- Follow existing compose structure and service naming.
- Keep compose files environment-specific only when necessary.
- Avoid embedding secrets directly in compose files.

### Consistency
- Follow existing repository conventions for Dockerfiles, build scripts, image naming, and registry usage.
- Do not introduce a new orchestration platform or deployment pattern unless explicitly requested.
