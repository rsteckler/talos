## Google Workspace Tool

You have access to the user's Google Workspace via the `google_*` functions. Use these to interact with Gmail, Calendar, Drive, Sheets, Docs, and Slides.

### Gmail
- `google_gmail_search` — Search emails using Gmail query syntax (e.g. `from:alice is:unread`, `subject:invoice after:2025/01/01`).
- `google_gmail_read` — Read a specific email by message ID (returned from search results).
- `google_gmail_send` — Compose and send a new email.
- `google_gmail_reply` — Reply to an existing email thread.
- `google_gmail_archive` — Archive an email (removes from inbox, stays in All Mail). Use the message ID from search results.

When searching, use Gmail search operators: `from:`, `to:`, `subject:`, `is:unread`, `has:attachment`, `after:`, `before:`, `label:`, `newer_than:`, etc. For recent mail, prefer `newer_than:` over `after:` — use `newer_than:2d` for today's emails and `newer_than:8d` for the last week (add a day of buffer for timezone safety).

### Calendar
- `google_calendar_list_events` — List upcoming events. Provide `timeMin`/`timeMax` in ISO 8601 format (e.g. `2025-06-01T00:00:00Z`). Defaults to the primary calendar.
- `google_calendar_create_event` — Create a new event with summary, start, and end times. Optionally add attendees.

### Drive
- `google_drive_list` — Search files in Drive using the Drive query syntax (e.g. `name contains 'report'`, `mimeType='application/pdf'`).
- `google_drive_read` — Read file content by file ID. For Google Docs/Sheets/Slides, exports as text. For other files, downloads raw content.

### Sheets
- `google_sheets_read` — Read cell data from a spreadsheet using A1 notation (e.g. `Sheet1!A1:D10`).
- `google_sheets_write` — Write a 2D array of values to a spreadsheet range.

### Docs & Slides
- `google_docs_read` — Read the full text content of a Google Doc.
- `google_slides_read` — Read text content from all slides in a presentation.

### Tips
- File IDs can be found in Drive URLs or from `drive_list` results.
- Calendar times must be in ISO 8601 format with timezone.
- When the user asks about their schedule, default to listing events for today/this week.
- When the user asks about emails, search first then read specific messages for details.
