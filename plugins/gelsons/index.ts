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

  pluginLog?.info("Navigating to shop.gelsons.com storefront");
  await browser.navigate("https://shop.gelsons.com/store/gelsons/storefront");

  // Poll until we see Account Menu (logged in), Sign In (logged out), or Confirm (popup).
  // If we see Confirm, click it and keep polling for the login state buttons.
  const deadline = Date.now() + 20000;
  pluginLog?.info("Waiting for storefront to render (20s)...");
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
      pluginLog?.info("Storefront ready — logged in");
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

// --- Exported handler map ---

export const handlers = {
  login,
  check_session: checkSession,
};
