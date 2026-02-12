import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { streamChat } from "../agent/core.js";
import { getLoadedChannels, getLoadedChannel } from "./loader.js";
import { broadcastStatus } from "../ws/index.js";
import { createLogger, ensureLogArea } from "../logger/index.js";
import type { ChannelContext } from "./types.js";
import type { InboxItem, ToolLogger } from "@talos/shared/types";
import type { ApprovalGate } from "../tools/index.js";

const log = createLogger("channels");

const activeChannels = new Set<string>();

function createChannelLogger(channelId: string, logName?: string): ToolLogger {
  const area = `channel:${logName ?? channelId}`;
  ensureLogArea(area);
  const inner = createLogger(area);
  return {
    info: (message: string) => inner.info(message),
    warn: (message: string) => inner.warn(message),
    error: (message: string) => inner.error(message),
    debug: (message: string) => inner.dev.debug(message),
  };
}

function createChannelContext(channelId: string, logName?: string): ChannelContext {
  const channelLog = createChannelLogger(channelId, logName);

  return {
    async chat(conversationId: string, userContent: string, approvalGate?: ApprovalGate): Promise<{ messageId: string; content: string }> {
      broadcastStatus("thinking");

      return new Promise<{ messageId: string; content: string }>((resolve, reject) => {
        let fullContent = "";

        streamChat(conversationId, userContent, {
          onChunk: (chunk) => {
            fullContent += chunk;
          },
          onEnd: (messageId) => {
            broadcastStatus("idle");
            resolve({ messageId, content: fullContent });
          },
          onError: (error) => {
            broadcastStatus("idle");
            reject(new Error(error));
          },
          approvalGate,
        }).catch((err) => {
          broadcastStatus("idle");
          reject(err);
        });
      });
    },

    async resolveConversation(externalChatId: string): Promise<string> {
      const existing = db
        .select()
        .from(schema.channelSessions)
        .where(
          and(
            eq(schema.channelSessions.channelId, channelId),
            eq(schema.channelSessions.externalChatId, externalChatId),
          ),
        )
        .get();

      if (existing) {
        return existing.conversationId;
      }

      return createConversation(channelId, externalChatId);
    },

    async newConversation(externalChatId: string): Promise<string> {
      return createConversation(channelId, externalChatId);
    },

    log: channelLog,
  };
}

function createConversation(channelId: string, externalChatId: string): string {
  const conversationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const loaded = getLoadedChannel(channelId);
  const channelName = loaded?.manifest.name ?? channelId;

  db.insert(schema.conversations)
    .values({
      id: conversationId,
      title: `${channelName} Chat`,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Upsert session — delete old if exists, then insert new
  const existing = db
    .select()
    .from(schema.channelSessions)
    .where(
      and(
        eq(schema.channelSessions.channelId, channelId),
        eq(schema.channelSessions.externalChatId, externalChatId),
      ),
    )
    .get();

  if (existing) {
    db.update(schema.channelSessions)
      .set({ conversationId, updatedAt: now })
      .where(eq(schema.channelSessions.id, existing.id))
      .run();
  } else {
    db.insert(schema.channelSessions)
      .values({
        id: crypto.randomUUID(),
        channelId,
        externalChatId,
        conversationId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return conversationId;
}

export async function initChannels(): Promise<void> {
  const channels = getLoadedChannels();

  for (const [channelId, loaded] of channels) {
    const configRow = db
      .select()
      .from(schema.channelConfigs)
      .where(eq(schema.channelConfigs.channelId, channelId))
      .get();

    if (!configRow?.isEnabled) continue;

    const storedConfig: Record<string, string> = configRow.config
      ? (JSON.parse(configRow.config) as Record<string, string>)
      : {};

    // Check required credentials
    const requiredCreds = loaded.manifest.credentials.filter((c) => c.required);
    const hasRequired = requiredCreds.every((c) => !!storedConfig[c.name]);
    if (!hasRequired) {
      log.warn(`Channel "${loaded.manifest.name}" enabled but missing required credentials, skipping`);
      continue;
    }

    // Split config into credentials and settings
    const credentialNames = new Set(loaded.manifest.credentials.map((c) => c.name));
    const credentials: Record<string, string> = {};
    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(storedConfig)) {
      if (credentialNames.has(key)) {
        credentials[key] = value;
      } else {
        settings[key] = value;
      }
    }

    try {
      const ctx = createChannelContext(channelId, loaded.manifest.logName);
      await loaded.handler.start(credentials, settings, ctx);
      activeChannels.add(channelId);
      log.info(`Channel "${loaded.manifest.name}" started`);
    } catch (err) {
      log.error(`Failed to start channel "${loaded.manifest.name}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function shutdownChannels(): Promise<void> {
  const channels = getLoadedChannels();

  for (const channelId of activeChannels) {
    const loaded = channels.get(channelId);
    if (!loaded) continue;

    try {
      await loaded.handler.stop();
      log.info(`Channel "${loaded.manifest.name}" stopped`);
    } catch (err) {
      log.error(`Failed to stop channel "${loaded.manifest.name}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  activeChannels.clear();
}

export async function startChannel(channelId: string): Promise<void> {
  const loaded = getLoadedChannel(channelId);
  if (!loaded) throw new Error(`Channel "${channelId}" not found`);

  if (activeChannels.has(channelId)) {
    await loaded.handler.stop();
    activeChannels.delete(channelId);
  }

  const configRow = db
    .select()
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.channelId, channelId))
    .get();

  const storedConfig: Record<string, string> = configRow?.config
    ? (JSON.parse(configRow.config) as Record<string, string>)
    : {};

  const credentialNames = new Set(loaded.manifest.credentials.map((c) => c.name));
  const credentials: Record<string, string> = {};
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(storedConfig)) {
    if (credentialNames.has(key)) {
      credentials[key] = value;
    } else {
      settings[key] = value;
    }
  }

  const ctx = createChannelContext(channelId, loaded.manifest.logName);
  await loaded.handler.start(credentials, settings, ctx);
  activeChannels.add(channelId);
  log.info(`Channel "${loaded.manifest.name}" started`);
}

export async function stopChannel(channelId: string): Promise<void> {
  const loaded = getLoadedChannel(channelId);
  if (!loaded) throw new Error(`Channel "${channelId}" not found`);

  if (activeChannels.has(channelId)) {
    await loaded.handler.stop();
    activeChannels.delete(channelId);
    log.info(`Channel "${loaded.manifest.name}" stopped`);
  }
}

export async function notifyChannels(item: InboxItem): Promise<void> {
  const channels = getLoadedChannels();

  for (const [channelId, loaded] of channels) {
    if (!activeChannels.has(channelId)) continue;
    if (!loaded.handler.notify) continue;

    const configRow = db
      .select()
      .from(schema.channelConfigs)
      .where(eq(schema.channelConfigs.channelId, channelId))
      .get();

    if (!configRow?.notificationsEnabled) continue;

    try {
      await loaded.handler.notify(item);
    } catch (err) {
      log.error(`Failed to notify via channel "${loaded.manifest.name}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
