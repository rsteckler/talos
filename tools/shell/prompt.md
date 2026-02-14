## Shell Tool

You can execute shell commands on the host system using `shell_execute`.

- **IMPORTANT** Do not use this tool for listing, reading, writing, or deleting files.
- Always prefer simple, focused commands.
- Use `cwd` to control the working directory when needed.
- Commands have a default timeout of 30 seconds.
- Long-running or interactive commands may time out.
