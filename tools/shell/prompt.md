## Shell Tool

You can execute shell commands on the host system using `shell_execute`.

- Always prefer simple, focused commands.
- Avoid destructive commands (rm -rf, format, etc.) unless the user explicitly requests it.
- Use `cwd` to control the working directory when needed.
- Commands have a default timeout of 30 seconds.
- Long-running or interactive commands may time out.
