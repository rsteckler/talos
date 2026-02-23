import type { PluginLogger } from "@talos/shared/types";

// --- Structural interface for the BrowserService methods we use ---

interface BrowserService {
  navigate(url: string, waitUntil?: string): Promise<{ url: string; title: string }>;
  evaluateJs(expression: string): Promise<{ result: unknown }>;
  waitForSelector(selector: string, state?: string, timeout?: number): Promise<unknown>;
  typeText(selector: string, text: string, clearFirst?: boolean): Promise<unknown>;
  click(selector: string): Promise<unknown>;
}

// --- State ---

let browser: BrowserService | null = null;
let pluginLog: PluginLogger | null = null;

// --- Lifecycle ---

export function init(
  logger: PluginLogger,
  services?: { getService: <T>(name: string) => T | undefined; registerService: (name: string, instance: unknown) => void },
): void {
  pluginLog = logger;
  if (services) {
    browser = services.getService<BrowserService>("browser") ?? null;
  }
}

export async function start(_credentials: Record<string, string>, logger: PluginLogger): Promise<void> {
  pluginLog = logger;
  logger.info("Gelson's plugin started");
}

export async function stop(): Promise<void> {
  pluginLog?.info("Gelson's plugin stopped");
}

// --- Helpers ---

type StorefrontState = 'logged-in' | 'logged-out' | 'timeout';

/** Navigate to the storefront, dismiss the fulfillment popup if present, and return the login state. */
async function waitForStorefront(): Promise<StorefrontState> {
  if (!browser) return 'timeout';

  pluginLog?.verbose("Navigating to shop.gelsons.com storefront");
  await browser.navigate("https://shop.gelsons.com/store/gelsons/storefront");

  // Poll until we see Account Menu (logged in), Sign In (logged out), or Confirm (popup).
  // If we see Confirm, click it and keep polling for the login state buttons.
  const deadline = Date.now() + 20000;
  pluginLog?.verbose("Waiting for storefront to render (20s)...");
  while (Date.now() < deadline) {
    const { result } = await browser.evaluateJs(`
      (() => {
        const btns = [...document.querySelectorAll('button')];
        if (btns.some(b => b.getAttribute('aria-label') === 'Account Menu')) return 'logged-in';
        if (btns.some(b => b.textContent?.trim() === 'Sign In / Register')) return 'logged-out';
        const confirm = btns.find(b => b.textContent?.trim() === 'Confirm');
        if (confirm) { confirm.click(); return 'dismissed-popup'; }
        return 'waiting:' + btns.map(b => b.textContent?.trim()).filter(Boolean).join('|');
      })()
    `);
    if (result === 'logged-in') {
      pluginLog?.verbose("Storefront ready — logged in");
      return 'logged-in';
    }
    if (result === 'logged-out') {
      pluginLog?.info("Storefront ready — logged out");
      return 'logged-out';
    }
    if (result === 'dismissed-popup') {
      pluginLog?.info("Clicked Confirm — dismissed fulfillment popup, waiting for login state...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    pluginLog?.info(`Poll: ${result}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  pluginLog?.info("Storefront did not reach a known state within 20s");
  return 'timeout';
}

/** Poll-dismiss the fulfillment popup on any page (search, etc.). Returns once dismissed or timeout. */
async function dismissPopupIfPresent(): Promise<void> {
  if (!browser) return;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { result } = await browser.evaluateJs(`
      (() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm');
        if (btn) { btn.click(); return 'dismissed'; }
        return 'none';
      })()
    `);
    if (result === 'dismissed') {
      pluginLog?.info("Dismissed fulfillment popup");
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }
    // If we see product cards or login buttons, the page is ready without a popup
    const { result: pageReady } = await browser.evaluateJs(`
      !!(document.querySelector('div[aria-label$="product card"]') ||
         document.querySelector('button[aria-label="Account Menu"]') ||
         document.querySelector('input#search-bar-input'))
    `);
    if (pageReady) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// --- Handlers ---

async function login(_args: Record<string, unknown>, credentials?: Record<string, string>): Promise<unknown> {
  if (!browser) {
    return { error: "Browser plugin is not available. Enable the browser plugin first." };
  }

  const email = credentials?.["email"];
  const password = credentials?.["password"];
  if (!email || !password) {
    return { error: "Gelson's email and password are required. Configure them in plugin settings." };
  }

  try {
    const state = await waitForStorefront();
    if (state === 'timeout') {
      return { error: "Timed out waiting for storefront to load." };
    }
    if (state === 'logged-in') {
      pluginLog?.info("Already logged in");
      return { success: true, message: "Already logged in" };
    }

    // Click "Sign In / Register" to trigger B2C login
    pluginLog?.info("Clicking Sign In button");
    await browser.click("button.e-okki8");

    // Wait for B2C login form
    await browser.waitForSelector("#signInName", undefined, 15000);

    // Fill credentials
    pluginLog?.info("Filling login form");
    await browser.typeText("#signInName", email, true);
    await browser.typeText("#password", password, true);

    // Submit
    pluginLog?.info("Submitting login");
    await browser.click("#next");

    // Wait for account menu button (proves login + redirect succeeded)
    try {
      await browser.waitForSelector('button[aria-label="Account Menu"]', undefined, 30000);
    } catch {
      // Timeout — check for CAPTCHA on the current page
      const { result: hasCaptcha } = await browser.evaluateJs(
        `!!(document.querySelector('iframe[src*="captcha"], iframe[title*="captcha"], #captcha, .captcha, [data-captcha], iframe[src*="recaptcha"], .g-recaptcha, #cf-turnstile'))`,
      );

      if (hasCaptcha) {
        return {
          error:
            "CAPTCHA detected — please log in manually with headless mode disabled in browser plugin settings. The session will persist for future automated logins.",
        };
      }

      // Check for login error messages on the B2C page
      const { result: errorMsg } = await browser.evaluateJs(
        `document.querySelector('.error, .pageLevel, #requiredFieldMissing, .itemLevel')?.textContent?.trim() ?? null`,
      );

      if (errorMsg) {
        return { error: `Login failed: ${errorMsg}` };
      }

      return { error: "Login failed — timed out waiting for account menu after sign-in." };
    }

    pluginLog?.info("Login successful");
    return { success: true, message: "Login successful" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pluginLog?.error(`Login failed: ${message}`);
    return { error: `Login failed: ${message}` };
  }
}

async function search(args: Record<string, unknown>): Promise<unknown> {
  if (!browser) {
    return { error: "Browser plugin is not available. Enable the browser plugin first." };
  }

  const query = typeof args["query"] === "string" ? args["query"].trim() : "";
  if (!query) {
    return { error: "Search query is required." };
  }

  const maxResults = typeof args["max_results"] === "number" ? args["max_results"] : 10;

  try {
    const searchUrl = `https://shop.gelsons.com/store/gelsons/s?k=${encodeURIComponent(query)}`;
    pluginLog?.info(`Searching for: ${query}`);
    await browser.navigate(searchUrl);

    // Dismiss fulfillment popup if it appears, then wait for results
    await dismissPopupIfPresent();

    // Poll for product cards to render
    const deadline = Date.now() + 15000;
    let found = false;
    while (Date.now() < deadline) {
      const { result } = await browser.evaluateJs(
        `document.querySelectorAll('div[aria-label$="product card"]').length`
      );
      if (typeof result === 'number' && result > 0) {
        found = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!found) {
      return { results: [], query, count: 0 };
    }

    // Extract product data
    const { result: products } = await browser.evaluateJs(`
      (() => {
        const cards = [...document.querySelectorAll('div[aria-label$="product card"]')];
        return cards.slice(0, ${maxResults}).map(card => {
          const label = card.getAttribute('aria-label') || '';
          const name = label.replace(/ product card$/i, '');

          const link = card.querySelector('a[href*="/products/"]');
          const url = link ? 'https://shop.gelsons.com' + link.getAttribute('href') : null;

          const img = card.querySelector('img[data-testid="item-card-image"]');
          const image = img ? img.getAttribute('src') : null;

          const priceEl = card.querySelector('.screen-reader-only');
          const priceText = priceEl ? priceEl.textContent : null;
          const price = priceText ? priceText.replace(/^Current price:\\s*/i, '').trim() : null;

          // Find size/unit text by matching common measurement patterns in leaf nodes
          let size = null;
          for (const el of card.querySelectorAll('div')) {
            const t = el.textContent?.trim();
            if (t && el.children.length === 0 &&
                /^[\\d.]+\\s*(fl\\s*oz|oz|lb|lbs|ct|pk|pack|ml|l|g|kg|each|gal|pt|qt)/i.test(t)) {
              size = t;
              break;
            }
          }

          // Find stock info in leaf nodes
          let stock = null;
          for (const el of card.querySelectorAll('div')) {
            const t = el.textContent?.trim();
            if (t && el.children.length === 0 && /in stock|out of stock|low stock/i.test(t)) {
              stock = t;
              break;
            }
          }

          return { name, price, size, stock, url, image };
        });
      })()
    `);

    const results = Array.isArray(products) ? products : [];
    pluginLog?.info(`Found ${String(results.length)} results for "${query}"`);
    return { results, query, count: results.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pluginLog?.error(`Search failed: ${message}`);
    return { error: `Search failed: ${message}` };
  }
}

async function checkSession(): Promise<unknown> {
  if (!browser) {
    return { error: "Browser plugin is not available. Enable the browser plugin first." };
  }

  try {
    const state = await waitForStorefront();
    if (state === 'timeout') {
      return { loggedIn: false, note: "Storefront did not load in time" };
    }
    return { loggedIn: state === 'logged-in' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pluginLog?.error(`Session check failed: ${message}`);
    return { error: `Session check failed: ${message}` };
  }
}

async function addToCart(args: Record<string, unknown>): Promise<unknown> {
  if (!browser) {
    return { error: "Browser plugin is not available. Enable the browser plugin first." };
  }

  const productName = typeof args["product_name"] === "string" ? args["product_name"].trim() : "";
  if (!productName) {
    return { error: "product_name is required." };
  }

  const quantity = typeof args["quantity"] === "number" && args["quantity"] >= 1 ? args["quantity"] : 1;

  try {
    // Escape product name for use inside JS string literals
    const escaped = productName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

    // Check if the product is on the current page:
    //   'add'       — fresh "Add 1 ct ..." button (not yet in cart)
    //   'quantity'  — "Quantity: N ct. Change quantity" button (already in cart, stepper collapsed)
    //   'increment' — increment button already visible (stepper expanded)
    //   'not-found' — product not on page
    const { result: buttonState } = await browser.evaluateJs(`
      (() => {
        const addBtn = document.querySelector('button[aria-label*="${escaped}"][aria-label^="Add "]');
        if (addBtn) return 'add';
        const qtyBtn = document.querySelector('button[aria-label*="Change quantity"][aria-label^="Quantity"]');
        if (qtyBtn) return 'quantity';
        const incBtn = document.querySelector('button[aria-label*="${escaped}"][aria-label^="Increment quantity of "]');
        if (incBtn) return 'increment';
        return 'not-found';
      })()
    `);

    if (buttonState === 'not-found') {
      return { error: `Product "${productName}" not found on the current page. Search for it first.` };
    }

    // If Add button exists, click it (adds 1 to cart)
    if (buttonState === 'add') {
      pluginLog?.info(`Adding "${productName}" to cart`);
      await browser.evaluateJs(`
        document.querySelector('button[aria-label*="${escaped}"][aria-label^="Add "]').click()
      `);
      // Wait for the stepper to appear (button transitions from Add to quantity/increment)
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // If the collapsed quantity button is showing, click it to reveal increment/decrement
    if (buttonState === 'quantity' || buttonState === 'add') {
      const { result: expandedStepper } = await browser.evaluateJs(`
        (() => {
          const qtyBtn = document.querySelector('button[aria-label*="Change quantity"][aria-label^="Quantity"]');
          if (qtyBtn) { qtyBtn.click(); return 'expanded'; }
          return 'no-qty-btn';
        })()
      `);
      if (expandedStepper === 'expanded') {
        pluginLog?.info("Expanded quantity stepper");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // If quantity > 1 (or was already in cart and we need more), click increment
    const clicksNeeded = buttonState === 'add' ? quantity - 1 : quantity;
    if (clicksNeeded > 0) {
      pluginLog?.info(`Clicking increment ${String(clicksNeeded)} time(s) for "${productName}"`);
      for (let i = 0; i < clicksNeeded; i++) {
        // Poll for the increment button (may take a moment after initial add)
        const incDeadline = Date.now() + 5000;
        let clicked = false;
        while (Date.now() < incDeadline) {
          const { result } = await browser.evaluateJs(`
            (() => {
              const btn = document.querySelector('button[aria-label*="${escaped}"][aria-label^="Increment quantity of "]');
              if (btn) { btn.click(); return true; }
              return false;
            })()
          `);
          if (result === true) {
            clicked = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!clicked) {
          pluginLog?.info(`Could not find increment button after adding ${String(i)} extra`);
          break;
        }
        // Small delay between clicks for the UI to update
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    // Read cart badge count
    await new Promise(resolve => setTimeout(resolve, 1000));
    const { result: cartCount } = await browser.evaluateJs(`
      (() => {
        const btn = document.querySelector('button[aria-label^="View Cart"]');
        if (!btn) return null;
        const match = btn.getAttribute('aria-label').match(/Items in cart:\\s*(\\d+)/i);
        return match ? parseInt(match[1], 10) : null;
      })()
    `);

    pluginLog?.info(`Added "${productName}" x${String(quantity)} — cart count: ${String(cartCount ?? 'unknown')}`);
    return {
      success: true,
      product: productName,
      quantity,
      cartCount: typeof cartCount === 'number' ? cartCount : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pluginLog?.error(`Add to cart failed: ${message}`);
    return { error: `Add to cart failed: ${message}` };
  }
}

// --- Exported handler map ---

export const handlers = {
  login,
  search,
  check_session: checkSession,
  add_to_cart: addToCart,
};
