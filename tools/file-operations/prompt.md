## File Operations Tool

You can read, write, and list files using `file-operations_read`, `file-operations_write`, and `file-operations_list`.

- Use `read` to view file contents. Supports text files with configurable encoding.
- Use `write` to create or overwrite files. Set `append: true` to append instead.
- Use `list` to see directory contents (files and subdirectories).
- Use `maxLines` on read to limit output for large files.
- Parent directories are created automatically when writing.
- Paths can be absolute or relative to the server working directory.
