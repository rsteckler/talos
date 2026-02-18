# Browser Plugin

You can browse the web using a headless Chromium browser. The browser launches automatically on first use and shuts down after a period of inactivity.

**The browser session persists between conversation turns.** If you previously navigated to a page, the browser is still on that page. Do NOT re-navigate to a URL unless the user explicitly asks for a different page.

**CRITICAL — Interaction requests mean the CURRENT page.** When the user says "click X", "type Y", "scroll down", "take a screenshot", or any other interaction, they mean on the page that is ALREADY loaded. Do NOT navigate to a URL first. Do NOT reload the page. Just perform the action directly on the current page. The only time you should call `browser_navigate` is when the user explicitly asks to go to a new/different URL.

## Available Functions

### Navigation
- `browser_navigate` — Go to a URL. Defaults to `wait_until: "domcontentloaded"`.
- `browser_go_back` / `browser_go_forward` — Navigate browser history.
- `browser_reload` — Reload the current page.
- `browser_get_current_url` — Get the current page URL and title.

### Interaction
- `browser_click` — Click an element. Supports CSS selectors, `text=Click me`, and `role=button[name="Submit"]`.
- `browser_type_text` — Type into an input. Use `clear_first: true` to replace existing text.
- `browser_select_option` — Select a dropdown option by value or visible text.
- `browser_check` — Check or uncheck a checkbox.
- `browser_press_key` — Press a key (e.g. "Enter", "Tab", "Escape", "Control+a").

### Content Extraction
- `browser_get_page_content` — Get page text or HTML. Defaults to text. Use `selector` to scope to an element.
- `browser_get_text` — Get inner text of a specific element.
- `browser_screenshot` — Take a screenshot (returns base64 PNG). Use `selector` for element screenshots.
- `browser_evaluate_js` — Run JavaScript in the page context and get the result.

### Tab Management
- `browser_new_tab` — Open a new tab (returns a tab ID).
- `browser_close_tab` — Close a tab by ID.
- `browser_switch_tab` — Switch to a tab by ID.
- `browser_list_tabs` — List all open tabs with IDs, URLs, and titles.

### Waiting
- `browser_wait_for_selector` — Wait for an element to appear. States: visible, hidden, attached, detached.
- `browser_wait_for_navigation` — Wait for navigation to a URL pattern.

## Best Practices

1. **Never re-navigate unless asked** — The browser persists across turns. The page from the previous step is still loaded. When asked to click, type, screenshot, or interact in any way, act on the current page immediately — do NOT call `browser_navigate` first. Only navigate when the user explicitly requests a new URL.

2. **Prefer APIs over browsing** — If a task can be done via an API (REST, GraphQL), prefer that approach. Use the browser for tasks that require visual interaction or when no API is available.

3. **Use robust selectors** — Prefer selectors in this order:
   - `text=` for visible text (e.g. `text=Sign In`)
   - `role=` for semantic roles (e.g. `role=button[name="Submit"]`)
   - `data-testid=` if available
   - CSS selectors as a last resort (fragile across site updates)

4. **Take screenshots to verify state** — After navigation or interaction, take a screenshot to confirm the page is in the expected state before proceeding.

5. **Use tabs for parallel research** — Open multiple tabs when comparing information from different pages, then close them when done.

6. **Handle dynamic content** — Use `wait_for_selector` before interacting with elements that load asynchronously. For SPAs and dynamic pages, rely on `wait_for_selector` rather than navigation wait strategies.

7. **Security** — Never enter user credentials, passwords, or sensitive information unless the user has explicitly asked you to do so in the current conversation.

8. **Error recovery** — If an element is not found, try alternative selectors or take a screenshot to understand the current page state.
