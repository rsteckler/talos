import { Router } from "express";
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { getLoadedPlugin } from "../plugins/index.js";
import { createLogger } from "../logger/index.js";
import type { PluginInfo } from "@talos/shared/types";

const log = createLogger("oauth");
const router = Router();

/** Read the stored config JSON for a plugin, or empty object. */
function getStoredConfig(pluginId: string): Record<string, string> {
  const row = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();
  return row?.config ? (JSON.parse(row.config) as Record<string, string>) : {};
}

/** Merge keys into a plugin's stored config JSON. */
function mergeStoredConfig(pluginId: string, updates: Record<string, string | undefined>): void {
  const existing = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  const current: Record<string, string> = existing?.config
    ? (JSON.parse(existing.config) as Record<string, string>)
    : {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete current[key];
    } else {
      current[key] = value;
    }
  }

  const configJson = JSON.stringify(current);

  if (existing) {
    db.update(schema.pluginConfigs)
      .set({ config: configJson })
      .where(eq(schema.pluginConfigs.pluginId, pluginId))
      .run();
  } else {
    db.insert(schema.pluginConfigs)
      .values({
        pluginId,
        config: configJson,
        isEnabled: false,
        createdAt: new Date().toISOString(),
      })
      .run();
  }
}

/** Build a PluginInfo response (same logic as plugins.ts toPluginInfo). */
function toPluginInfo(pluginId: string): PluginInfo | null {
  const loaded = getLoadedPlugin(pluginId);
  if (!loaded) return null;

  const configRow = db
    .select()
    .from(schema.pluginConfigs)
    .where(eq(schema.pluginConfigs.pluginId, pluginId))
    .get();

  const storedConfig: Record<string, string> = configRow?.config
    ? (JSON.parse(configRow.config) as Record<string, string>)
    : {};

  const credentials = loaded.manifest.credentials ?? [];
  const requiredCreds = credentials.filter((c) => c.required);
  const hasRequiredCredentials = requiredCreds.every((c) => !!storedConfig[c.name]);

  const oauthConnected = loaded.manifest.oauth
    ? !!storedConfig["refresh_token"]
    : undefined;

  return {
    id: loaded.manifest.id,
    name: loaded.manifest.name,
    description: loaded.manifest.description,
    version: loaded.manifest.version,
    isEnabled: configRow?.isEnabled ?? false,
    allowWithoutAsking: configRow?.allowWithoutAsking ?? false,
    credentials,
    oauth: loaded.manifest.oauth,
    oauthConnected,
    settings: loaded.manifest.settings ?? [],
    triggers: loaded.manifest.triggers ?? [],
    functions: loaded.manifest.functions,
    hasRequiredCredentials,
  };
}

// GET /api/oauth/google/authorize
router.get("/oauth/google/authorize", (req, res) => {
  const config = getStoredConfig("google");
  const clientId = config["client_id"];
  const clientSecret = config["client_secret"];

  if (!clientId || !clientSecret) {
    res.status(400).json({ error: "Google OAuth credentials not configured. Set Client ID and Client Secret first." });
    return;
  }

  const loaded = getLoadedPlugin("google");
  const scopes = loaded?.manifest.oauth?.scopes ?? [];

  const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/google/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });

  log.dev.debug("Redirecting to Google OAuth consent screen");
  res.redirect(url);
});

// GET /api/oauth/google/callback
router.get("/oauth/google/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  if (!code) {
    res.status(400).send("Missing authorization code.");
    return;
  }

  const config = getStoredConfig("google");
  const clientId = config["client_id"];
  const clientSecret = config["client_secret"];

  if (!clientId || !clientSecret) {
    res.status(400).send("OAuth credentials missing.");
    return;
  }

  const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/google/callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);

    mergeStoredConfig("google", {
      refresh_token: tokens.refresh_token ?? undefined,
      access_token: tokens.access_token ?? undefined,
      token_expiry: tokens.expiry_date ? String(tokens.expiry_date) : undefined,
    });

    // Create or reschedule re-auth reminder task
    createReauthTask(config);

    log.info("Google OAuth connected successfully");

    // Return HTML that notifies the opener and closes
    res.send(`
<!DOCTYPE html>
<html><head><title>OAuth Complete</title></head>
<body>
<p>Google account connected. This window will close.</p>
<script>
  if (window.opener) {
    window.opener.postMessage("oauth_complete", "*");
  }
  window.close();
</script>
</body>
</html>
    `.trim());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("OAuth token exchange failed", { error: message });
    res.status(500).send(`OAuth failed: ${message}`);
  }
});

// POST /api/oauth/google/disconnect
router.post("/oauth/google/disconnect", (_req, res) => {
  const config = getStoredConfig("google");

  // Remove the re-auth task if it exists
  const reauthTaskId = config["reauth_task_id"];
  if (reauthTaskId) {
    db.delete(schema.tasks)
      .where(eq(schema.tasks.id, reauthTaskId))
      .run();
  }

  // Remove OAuth tokens from config
  mergeStoredConfig("google", {
    refresh_token: undefined,
    access_token: undefined,
    token_expiry: undefined,
    reauth_task_id: undefined,
  });

  log.info("Google OAuth disconnected");

  const info = toPluginInfo("google");
  res.json({ data: info });
});

// GET /api/oauth/google/status
router.get("/oauth/google/status", (_req, res) => {
  const config = getStoredConfig("google");
  res.json({ data: { connected: !!config["refresh_token"] } });
});

/** Create (or reschedule) the 6-day re-auth reminder task. */
function createReauthTask(config: Record<string, string>): void {
  // Delete old task if exists
  const oldTaskId = config["reauth_task_id"];
  if (oldTaskId) {
    db.delete(schema.tasks)
      .where(eq(schema.tasks.id, oldTaskId))
      .run();
  }

  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(schema.tasks)
    .values({
      id: taskId,
      name: "Google re-auth reminder",
      description: "Reminds user to re-authenticate Google OAuth before 7-day token expiry",
      triggerType: "interval",
      triggerConfig: JSON.stringify({ interval_minutes: 8640 }),
      actionPrompt:
        "The user's Google OAuth refresh token will expire in approximately 24 hours. Send a notification reminding them to reconnect their Google account in Settings > Plugins > Google Workspace. This is important — without re-authentication, Gmail, Calendar, Drive, and other Google plugins will stop working.",
      tools: null,
      isActive: true,
      createdAt: now,
    })
    .run();

  // Store task ID in config for later cleanup
  mergeStoredConfig("google", { reauth_task_id: taskId });

  log.dev.debug("Created re-auth reminder task", { taskId });
}

export { router as oauthRouter };
