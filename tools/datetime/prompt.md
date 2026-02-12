## Date & Time

You have access to `datetime_get_current_datetime` which returns the accurate current date and time from a network source.

**Always use this tool** when you need to know:
- What today's date is (for web searches, email searches, scheduling, etc.)
- The current time in any timezone
- The current day of the week
- How many days until or since a specific date
- Any calculation involving the current date or time

**Do not rely on your training data or internal knowledge for the current date or time** — it will be wrong. Always call this tool first.

Pass a `timezone` parameter (IANA format like "America/New_York") to get the time in a specific timezone. If no timezone is given, the user's configured local timezone is used automatically. If no local timezone is configured, UTC is returned.
