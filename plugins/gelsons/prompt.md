# Gelson's

Automates grocery shopping on shop.gelsons.com via a persistent browser session.

## Common

### Tools

| Tool | Purpose |
|------|---------|
| `check_session` | Check if the browser is logged into Gelson's |
| `login` | Log into the Gelson's account (uses stored credentials) |
| `search` | Search for products by keyword — returns `gelsons_item_id`, prices, sizes, stock |
| `add_to_cart` | Add a product to the cart by `gelsons_item_id` and quantity (must be on the current page) |

### CAPTCHA Handling

If `login` reports a CAPTCHA, tell the user to log in manually once with headless mode disabled in the browser plugin settings. The session cookies persist for future automated logins.

### Error Recovery

- **"Browser plugin is not available"** — The browser plugin needs to be enabled in Talos settings.
- **Login timeout** — The storefront may be slow. Retry once, then suggest the user check their network or try manually.

## Planner

### Workflow

Always follow this order:

1. **Login** — Always call `login` first. It checks session state automatically and returns success immediately if already logged in. Only performs actual login when needed.
2. **Search** — Call `search` with a query. Results stay on the page for cart operations.
3. **Add to cart** — Call `add_to_cart` with the exact `gelsons_item_id` from search results and a `quantity` (defaults to 1). Use the quantity parameter for multiples — do NOT create separate steps for the same product.

**Note:** Do NOT call `check_session` before `login`. The `login` function already handles session detection internally.

### Rules
- **Search before adding to cart.** `add_to_cart` operates on the currently loaded page. If you haven't searched, there are no products to add.
- **One search at a time.** A new `search` call replaces the previous results page. Plan all add_to_cart steps for the current search results before planning the next search.
- **Specify cannonical results rather than ordinal.** When planning a step, do not assume the best result is the first one.  Always tell the add_to_cart step to choose the item that best represents the human's intent.

### Error Recovery
- **"Product not found on the current page"** — Run `search` for the product first, then retry `add_to_cart`.

## Executor

### Rules

- **Use exact `gelsons_item_id`.** Pass the `gelsons_item_id` exactly as returned by `search`. Partial matches will fail. Do not assume the example in the step description is correct — the value you provide MUST be one of the `gelsons_item_id` values from the search results.
- **Choose canonical results.** When calling add_to_cart, choose the item from the prior step's search results that most represents what the human asked for. For example, if the human asked for a potato, don't add "potato chips", even when they are the first result, when "potatoes" are available.
- **Prefer to call __error__ instead of adding an irrelevant item.**  When searching for Television, Gelsons won't have one, but will show TV dinners.  **DO NOT** add them, as they are not Televisions.  Instead, report the error with an explanation that none of the items matched the human's request.
- **Quantity stacks.** If an item is already in the cart, `add_to_cart` adds the specified quantity on top of what's there. It does not set an absolute quantity.
- **Don't retry blindly.** If `add_to_cart` returns an error saying the product wasn't found, report the error — do not retry with different IDs.
