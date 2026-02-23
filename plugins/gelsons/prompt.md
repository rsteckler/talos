# Gelson's

Automates grocery shopping on shop.gelsons.com via a persistent browser session.

## Tools

| Tool | Purpose |
|------|---------|
| `check_session` | Check if the browser is logged into Gelson's |
| `login` | Log into the Gelson's account (uses stored credentials) |
| `search` | Search for products by keyword — returns names, prices, sizes, stock |
| `add_to_cart` | Add a product to the cart by name and quantity (must be on the current page) |

## Workflow

Always follow this order:

1. **Login** — Always call `login` first. It checks session state automatically and returns success immediately if already logged in. Only performs actual login when needed.
2. **Search** — Call `search` with a query. Results stay on the page for cart operations.
3. **Add to cart** — Call `add_to_cart` with the exact `product_name` from search results and a `quantity` (defaults to 1). Use the quantity parameter for multiples — do NOT create separate steps for the same product. The product must be visible on the current page.

**Note:** Do NOT call `check_session` before `login`. The `login` function already handles session detection internally.

## Important Rules

- **Search before adding to cart.** `add_to_cart` operates on the currently loaded page. If you haven't searched, there are no products to add.
- **Use exact product names.** Pass the product name exactly as returned by `search`. Partial matches may fail.
- **One search at a time.** A new `search` call replaces the previous results page. Add everything you need from the current results before searching again.
- **Quantity stacks.** If an item is already in the cart, `add_to_cart` adds the specified quantity on top of what's there. It does not set an absolute quantity.
- **Don't retry blindly.** If `add_to_cart` returns an error saying the product wasn't found, call `search` again rather than retrying the same `add_to_cart`.

## CAPTCHA Handling

If `login` reports a CAPTCHA, tell the user to log in manually once with headless mode disabled in the browser plugin settings. The session cookies persist for future automated logins.

## Error Recovery

- **"Browser plugin is not available"** — The browser plugin needs to be enabled in Talos settings.
- **"Product not found on the current page"** — Run `search` for the product first, then retry `add_to_cart`.
- **Login timeout** — The storefront may be slow. Retry once, then suggest the user check their network or try manually.
