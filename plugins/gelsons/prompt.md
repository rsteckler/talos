# Gelson's

This plugin handles Gelson's grocery shopping automation.

## Tools

- `check_session` — Check if the browser is currently logged into Gelson's. Requires the browser plugin but no credentials.
- `login` — Log into the Gelson's account. Requires email and password credentials.

## Workflow

1. **Check session** — Call `check_session` to see if you're already logged in before attempting login.
2. **Login if needed** — Call `login` if the session is not active. The browser session persists, so you only need to log in once per session.
3. Search, add to cart, and checkout functions will be available in future updates.

## CAPTCHA Handling

If `login` reports a CAPTCHA was detected, the user needs to log in manually once with headless mode disabled in the browser plugin settings. After a successful manual login, the session cookies will persist for future automated logins.
