## File Operations Tool

You can read, write, list, and delete files using `file-operations_read`, `file-operations_write`, `file-operations_list`, and `file-operations_delete`.

- Use `read` to view file contents. Supports text files with configurable encoding.
- Use `write` to create or overwrite files. Set `append: true` to append instead.
- Use `list` to see directory contents (files and subdirectories).
- Use `delete` to remove a file or empty directory.
- Use `maxLines` on read to limit output for large files.
- Parent directories are created automatically when writing.
- Paths can be absolute or relative to the server working directory.

Note: Some operations may be restricted by the user's configuration. If an operation is disabled or a path is outside the allowed sandbox directory, the tool will return an error.
