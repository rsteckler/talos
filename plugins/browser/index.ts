import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PluginLogger } from "@talos/shared/types";

// ---------------------------------------------------------------------------
// Resolve playwright from the server's node_modules (pnpm strict mode)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, "..", "..", "apps", "server");
const require = createRequire(path.join(serverDir, "package.json"));

const SCREENSHOTS_DIR = path.join(serverDir, "data", "screenshots");
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const BROWSER_PROFILE_DIR = path.join(serverDir, "data", "browser-profile");
fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });

// Lazy-loaded playwright reference
let pw: typeof import("playwright") | null = null;

function getPlaywright(): typeof import("playwright") {
  if (!pw) {
    pw = require("playwright") as typeof import("playwright");
  }
  return pw;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;

// Use structural types to avoid import("playwright") in type positions
interface BrowserLike {
  isConnected(): boolean;
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

interface BrowserContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
  cookies(urls?: string[]): Promise<CookieData[]>;
  addCookies(cookies: CookieData[]): Promise<void>;
  clearCookies(): Promise<void>;
  pages(): PageLike[];
}

interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

interface PageLike {
  isClosed(): boolean;
  close(): Promise<void>;
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  goBack(options?: { waitUntil?: string }): Promise<unknown>;
  goForward(options?: { waitUntil?: string }): Promise<unknown>;
  reload(options?: { waitUntil?: string }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  click(selector: string, options?: { button?: string; clickCount?: number }): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, values: string): Promise<string[]>;
  check(selector: string): Promise<void>;
  uncheck(selector: string): Promise<void>;
  content(): Promise<string>;
  innerText(selector: string): Promise<string>;
  screenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
  evaluate(expression: string): Promise<unknown>;
  waitForSelector(selector: string, options?: { state?: string; timeout?: number }): Promise<unknown>;
  waitForURL(url: string, options?: { timeout?: number }): Promise<void>;
  bringToFront(): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  locator(selector: string): LocatorLike;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface LocatorLike {
  first(): LocatorLike;
  innerHTML(): Promise<string>;
  innerText(): Promise<string>;
  screenshot(): Promise<Buffer>;
}

interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// BrowserService
// ---------------------------------------------------------------------------

class BrowserService {
  private browser: BrowserLike | null = null;
  private context: BrowserContextLike | null = null;
  private persistSession = true;
  private pages = new Map<string, PageLike>();
  private activeTabId: string | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private nextTabId = 1;
  private headless = true;
  private idleTimeoutMs = 5 * 60_000;
  private log: PluginLogger | null = null;

  configure(settings: Record<string, string>, logger: PluginLogger): void {
    this.log = logger;
    const timeout = Number(settings["idle_timeout"]);
    if (timeout > 0) this.idleTimeoutMs = timeout * 60_000;
    this.headless = settings["headless"] !== "false";
    this.persistSession = settings["persist_session"] !== "false";
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.log?.info("Browser idle timeout reached, shutting down");
      void this.shutdown();
    }, this.idleTimeoutMs);
  }

  private installBrowser(): void {
    const cliPath = require.resolve("playwright/cli");
    this.log?.info("Chromium not found — installing (one-time download, may take a minute)...");
    execSync(`node ${JSON.stringify(cliPath)} install chromium`, {
      stdio: "pipe",
      timeout: 5 * 60_000,
    });
    this.log?.info("Chromium installed successfully");
  }

  private async ensureBrowser(): Promise<BrowserLike> {
    if (this.browser && this.browser.isConnected()) {
      this.resetIdleTimer();
      return this.browser;
    }

    const { chromium } = getPlaywright();
    const launchOpts = { headless: this.headless };

    if (this.persistSession) {
      this.log?.info(`Launching Chromium with persistent profile (headless=${String(this.headless)})`);
      try {
        const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, launchOpts) as unknown as BrowserContextLike;
        this.context = ctx;
        let closed = false;
        this.browser = {
          isConnected: () => !closed,
          newPage: () => ctx.newPage(),
          close: async () => { closed = true; await ctx.close(); },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("Executable doesn't exist")) {
          this.installBrowser();
          const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, launchOpts) as unknown as BrowserContextLike;
          this.context = ctx;
          let closed = false;
          this.browser = {
            isConnected: () => !closed,
            newPage: () => ctx.newPage(),
            close: async () => { closed = true; await ctx.close(); },
          };
        } else {
          throw err;
        }
      }
    } else {
      this.log?.info(`Launching Chromium (headless=${String(this.headless)})`);
      try {
        this.browser = await chromium.launch(launchOpts) as BrowserLike;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("Executable doesn't exist")) {
          this.installBrowser();
          this.browser = await chromium.launch(launchOpts) as BrowserLike;
        } else {
          throw err;
        }
      }
      this.context = null;
    }

    this.resetIdleTimer();
    return this.browser;
  }

  private attachPageListeners(page: PageLike, tabId: string): void {
    page.on("console", (msg: unknown) => {
      const m = msg as { type?: () => string; text?: () => string };
      if (typeof m.type === "function" && typeof m.text === "function") {
        this.log?.debug(`[${tabId}] console.${m.type()}: ${m.text()}`);
      }
    });
    page.on("pageerror", (err: unknown) => {
      this.log?.warn(`[${tabId}] page error: ${err instanceof Error ? err.message : String(err)}`);
    });
    page.on("requestfailed", (req: unknown) => {
      const r = req as { url?: () => string; failure?: () => { errorText: string } | null };
      if (typeof r.url === "function" && typeof r.failure === "function") {
        const failure = r.failure();
        this.log?.debug(`[${tabId}] request failed: ${r.url()} — ${failure?.errorText ?? "unknown"}`);
      }
    });
    page.on("response", (res: unknown) => {
      const r = res as { url?: () => string; status?: () => number };
      if (typeof r.url === "function" && typeof r.status === "function") {
        const status = r.status();
        if (status >= 400) {
          this.log?.debug(`[${tabId}] HTTP ${String(status)}: ${r.url()}`);
        }
      }
    });
  }

  private async ensurePage(): Promise<PageLike> {
    if (this.activeTabId) {
      const page = this.pages.get(this.activeTabId);
      if (page && !page.isClosed()) {
        this.resetIdleTimer();
        return page;
      }
      // Active tab was closed externally, clean up
      this.pages.delete(this.activeTabId);
      this.activeTabId = null;
    }

    // Create a default page
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    const tabId = `tab_${String(this.nextTabId++)}`;
    this.attachPageListeners(page, tabId);
    this.pages.set(tabId, page);
    this.activeTabId = tabId;
    this.resetIdleTimer();
    return page;
  }

  private getActivePage(): PageLike | null {
    if (!this.activeTabId) return null;
    const page = this.pages.get(this.activeTabId);
    if (page && !page.isClosed()) return page;
    this.pages.delete(this.activeTabId);
    this.activeTabId = null;
    return null;
  }

  /** Lightweight state summary included in tool results so the LLM knows where the browser is. */
  private async pageState(): Promise<{ current_url: string; title: string }> {
    const page = this.getActivePage();
    if (!page) return { current_url: "about:blank", title: "" };
    return { current_url: page.url(), title: await page.title() };
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    for (const [id, page] of this.pages) {
      try {
        if (!page.isClosed()) await page.close();
      } catch {
        // Page may already be closed
      }
      this.pages.delete(id);
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Browser may already be closed
      }
      this.browser = null;
    }

    this.context = null;
    this.activeTabId = null;
    this.log?.info("Browser shut down");
  }

  // --- Navigation ---

  async navigate(url: string, waitUntil?: string): Promise<{ url: string; title: string }> {
    const page = await this.ensurePage();
    const validWaits = ["load", "domcontentloaded"] as const;
    type WaitUntil = (typeof validWaits)[number];
    const waitOpt = validWaits.includes(waitUntil as WaitUntil)
      ? waitUntil
      : "domcontentloaded";
    this.log?.info(`Navigating to ${url} (waitUntil=${waitOpt})`);
    await page.goto(url, { waitUntil: waitOpt });
    const finalUrl = page.url();
    const title = await page.title();
    this.log?.info(`Navigation complete: ${finalUrl}`);
    return { url: finalUrl, title };
  }

  async goBack(): Promise<{ url: string; title: string }> {
    const page = await this.ensurePage();
    await page.goBack();
    return { url: page.url(), title: await page.title() };
  }

  async goForward(): Promise<{ url: string; title: string }> {
    const page = await this.ensurePage();
    await page.goForward();
    return { url: page.url(), title: await page.title() };
  }

  async reload(): Promise<{ url: string; title: string }> {
    const page = await this.ensurePage();
    await page.reload();
    return { url: page.url(), title: await page.title() };
  }

  async getCurrentUrl(): Promise<{ url: string; title: string }> {
    const page = this.getActivePage();
    if (!page) return { url: "about:blank", title: "" };
    return { url: page.url(), title: await page.title() };
  }

  // --- Interaction ---

  async click(selector: string, button?: string, clickCount?: number): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    const validButtons = ["left", "right", "middle"] as const;
    type Button = (typeof validButtons)[number];
    const btn = validButtons.includes(button as Button) ? button : "left";
    await page.click(selector, { button: btn, clickCount: clickCount ?? 1 });
    return { success: true, ...await this.pageState() };
  }

  async typeText(selector: string, text: string, clearFirst?: boolean): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    if (clearFirst) {
      await page.fill(selector, "");
    }
    await page.fill(selector, text);
    return { success: true, ...await this.pageState() };
  }

  async selectOption(selector: string, value: string): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    const selected = await page.selectOption(selector, value);
    return { selected, ...await this.pageState() };
  }

  async check(selector: string, checked: boolean): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    if (checked) {
      await page.check(selector);
    } else {
      await page.uncheck(selector);
    }
    return { success: true, ...await this.pageState() };
  }

  async pressKey(key: string): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    await page.keyboard.press(key);
    return { success: true, ...await this.pageState() };
  }

  // --- Content ---

  async getPageContent(format?: string, selector?: string): Promise<{ content: string }> {
    const page = await this.ensurePage();
    if (selector) {
      const el = page.locator(selector).first();
      const content = format === "html"
        ? await el.innerHTML()
        : await el.innerText();
      return { content };
    }
    const content = format === "html"
      ? await page.content()
      : await page.innerText("body");
    return { content };
  }

  async getText(selector: string): Promise<{ text: string }> {
    const page = await this.ensurePage();
    const text = await page.locator(selector).first().innerText();
    return { text };
  }

  async screenshot(selector?: string, fullPage?: boolean): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    let buffer: Buffer;
    if (selector) {
      buffer = await page.locator(selector).first().screenshot();
    } else {
      buffer = await page.screenshot({ fullPage: fullPage ?? false });
    }
    const filename = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, filename), buffer);
    return {
      screenshot_url: `/api/screenshots/${filename}`,
      message: "Screenshot captured and displayed to the user in chat.",
      ...await this.pageState(),
    };
  }

  async evaluateJs(expression: string): Promise<{ result: unknown }> {
    const page = await this.ensurePage();
    const result: unknown = await page.evaluate(expression);
    return { result };
  }

  // --- Tabs ---

  async newTab(): Promise<{ tab_id: string }> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    const tabId = `tab_${String(this.nextTabId++)}`;
    this.attachPageListeners(page, tabId);
    this.pages.set(tabId, page);
    this.activeTabId = tabId;
    this.resetIdleTimer();
    return { tab_id: tabId };
  }

  async closeTab(tabId: string): Promise<{ success: true }> {
    const page = this.pages.get(tabId);
    if (!page) throw new Error(`Tab "${tabId}" not found`);
    if (!page.isClosed()) await page.close();
    this.pages.delete(tabId);

    if (this.activeTabId === tabId) {
      // Switch to the most recently added remaining tab
      const remaining = [...this.pages.keys()];
      this.activeTabId = remaining[remaining.length - 1] ?? null;
    }
    this.resetIdleTimer();
    return { success: true };
  }

  async switchTab(tabId: string): Promise<{ tab_id: string; url: string; title: string }> {
    const page = this.pages.get(tabId);
    if (!page || page.isClosed()) throw new Error(`Tab "${tabId}" not found or closed`);
    this.activeTabId = tabId;
    await page.bringToFront();
    this.resetIdleTimer();
    return { tab_id: tabId, url: page.url(), title: await page.title() };
  }

  async listTabs(): Promise<{ tabs: TabInfo[] }> {
    const tabs: TabInfo[] = [];
    for (const [id, page] of this.pages) {
      if (page.isClosed()) {
        this.pages.delete(id);
        continue;
      }
      tabs.push({
        id,
        url: page.url(),
        title: await page.title(),
        active: id === this.activeTabId,
      });
    }
    return { tabs };
  }

  // --- Waiting ---

  async waitForSelector(
    selector: string,
    state?: string,
    timeout?: number,
  ): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    const validStates = ["visible", "hidden", "attached", "detached"] as const;
    type WaitState = (typeof validStates)[number];
    const waitState = validStates.includes(state as WaitState) ? state : "visible";
    await page.waitForSelector(selector, {
      state: waitState,
      timeout: timeout ?? 30_000,
    });
    return { found: true, ...await this.pageState() };
  }

  async waitForNavigation(url?: string, timeout?: number): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    await page.waitForURL(url ?? "**", { timeout: timeout ?? 30_000 });
    return { url: page.url(), ...await this.pageState() };
  }

  // --- Cookies ---

  async getCookies(urls?: string[]): Promise<{ cookies: CookieData[] }> {
    if (!this.context) return { cookies: [] };
    const cookies = urls ? await this.context.cookies(urls) : await this.context.cookies();
    return { cookies: cookies as CookieData[] };
  }

  async setCookies(cookies: CookieData[]): Promise<{ success: true }> {
    if (!this.context) throw new Error("No browser context available — enable persist_session or launch the browser first");
    await this.context.addCookies(cookies);
    return { success: true };
  }

  async clearCookies(): Promise<{ success: true }> {
    if (!this.context) throw new Error("No browser context available — enable persist_session or launch the browser first");
    await this.context.clearCookies();
    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

let browserService: BrowserService | null = null;
let pluginLog: PluginLogger | null = null;

export function init(
  logger: PluginLogger,
  services?: { registerService: (name: string, instance: unknown) => void },
): void {
  pluginLog = logger;
  browserService = new BrowserService();
  if (services) {
    services.registerService("browser", browserService);
  }
}

export async function start(credentials: Record<string, string>, logger: PluginLogger): Promise<void> {
  pluginLog = logger;
  if (browserService) {
    browserService.configure(credentials, logger);
  }
  logger.info("Browser plugin started (browser will launch on first use)");
}

export async function stop(): Promise<void> {
  if (browserService) {
    await browserService.shutdown();
  }
  pluginLog?.info("Browser plugin stopped");
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

function svc(): BrowserService {
  if (!browserService) throw new Error("Browser plugin not initialized");
  return browserService;
}

function wrap(fn: (args: Args) => Promise<unknown>): Handler {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// Navigation
const navigate = wrap(async (args) => {
  return svc().navigate(args["url"] as string, args["wait_until"] as string | undefined);
});

const go_back = wrap(async () => {
  return svc().goBack();
});

const go_forward = wrap(async () => {
  return svc().goForward();
});

const reload = wrap(async () => {
  return svc().reload();
});

const get_current_url = wrap(async () => {
  return svc().getCurrentUrl();
});

// Interaction
const click = wrap(async (args) => {
  return svc().click(
    args["selector"] as string,
    args["button"] as string | undefined,
    args["click_count"] as number | undefined,
  );
});

const type_text = wrap(async (args) => {
  return svc().typeText(
    args["selector"] as string,
    args["text"] as string,
    args["clear_first"] as boolean | undefined,
  );
});

const select_option = wrap(async (args) => {
  return svc().selectOption(args["selector"] as string, args["value"] as string);
});

const check = wrap(async (args) => {
  return svc().check(args["selector"] as string, args["checked"] as boolean);
});

const press_key = wrap(async (args) => {
  return svc().pressKey(args["key"] as string);
});

// Content
const get_page_content = wrap(async (args) => {
  return svc().getPageContent(
    args["format"] as string | undefined,
    args["selector"] as string | undefined,
  );
});

const get_text = wrap(async (args) => {
  return svc().getText(args["selector"] as string);
});

const screenshot = wrap(async (args) => {
  return svc().screenshot(
    args["selector"] as string | undefined,
    args["full_page"] as boolean | undefined,
  );
});

const evaluate_js = wrap(async (args) => {
  return svc().evaluateJs(args["expression"] as string);
});

// Tabs
const new_tab = wrap(async () => {
  return svc().newTab();
});

const close_tab = wrap(async (args) => {
  return svc().closeTab(args["tab_id"] as string);
});

const switch_tab = wrap(async (args) => {
  return svc().switchTab(args["tab_id"] as string);
});

const list_tabs = wrap(async () => {
  return svc().listTabs();
});

// Waiting
const wait_for_selector = wrap(async (args) => {
  return svc().waitForSelector(
    args["selector"] as string,
    args["state"] as string | undefined,
    args["timeout"] as number | undefined,
  );
});

const wait_for_navigation = wrap(async (args) => {
  return svc().waitForNavigation(
    args["url"] as string | undefined,
    args["timeout"] as number | undefined,
  );
});

// Cookies
const get_cookies = wrap(async (args) => {
  return svc().getCookies(args["urls"] as string[] | undefined);
});

const set_cookies = wrap(async (args) => {
  return svc().setCookies(args["cookies"] as CookieData[]);
});

const clear_cookies = wrap(async () => {
  return svc().clearCookies();
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const handlers: Record<string, Handler> = {
  navigate,
  go_back,
  go_forward,
  reload,
  get_current_url,
  click,
  type_text,
  select_option,
  check,
  press_key,
  get_page_content,
  get_text,
  screenshot,
  evaluate_js,
  new_tab,
  close_tab,
  switch_tab,
  list_tabs,
  wait_for_selector,
  wait_for_navigation,
  get_cookies,
  set_cookies,
  clear_cookies,
};
