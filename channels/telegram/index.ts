import { Bot, InlineKeyboard } from "grammy";
import type { ChannelHandler, ChannelContext } from "../../apps/server/src/channels/types.js";
import type { InboxItem } from "@talos/shared/types";

const MAX_MESSAGE_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      parts.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIdx = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (splitIdx < MAX_MESSAGE_LENGTH / 2) {
      // No good newline split point, split at space
      splitIdx = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    }
    if (splitIdx < MAX_MESSAGE_LENGTH / 2) {
      // No good split point, hard split
      splitIdx = MAX_MESSAGE_LENGTH;
    }

    parts.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return parts;
}

export const handler: ChannelHandler = {
  async start(credentials, settings, ctx) {
    const token = credentials["bot_token"];
    if (!token) throw new Error("Bot token is required");

    const allowedChatIds = settings["allowed_chat_ids"]
      ? new Set(settings["allowed_chat_ids"].split(",").map((s) => s.trim()).filter(Boolean))
      : null;

    const bot = new Bot(token);
    const knownChatIds = new Set<string>();

    // Track pending tool approvals
    const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void; toolName: string }>();

    // Get bot info for group @mention detection
    let botUsername = "";

    function isAllowed(chatId: number): boolean {
      if (!allowedChatIds) return true;
      return allowedChatIds.has(String(chatId));
    }

    // Prevent unhandled errors from killing the polling loop
    bot.catch((err) => {
      ctx.log.error(`Bot error: ${err.message}`);
    });

    // Handle callback queries for tool approval
    bot.on("callback_query:data", async (tgCtx) => {
      const data = tgCtx.callbackQuery.data;
      if (!data.startsWith("approve:") && !data.startsWith("deny:")) return;

      const [action, approvalId] = data.split(":");
      if (!approvalId) return;

      const pending = pendingApprovals.get(approvalId);
      if (!pending) {
        await tgCtx.answerCallbackQuery({ text: "This approval has expired." });
        return;
      }

      const approved = action === "approve";
      pending.resolve(approved);
      pendingApprovals.delete(approvalId);

      await tgCtx.answerCallbackQuery({
        text: approved ? `Approved: ${pending.toolName}` : `Denied: ${pending.toolName}`,
      });

      await tgCtx.editMessageReplyMarkup({ reply_markup: undefined });
      await tgCtx.editMessageText(
        `Tool: ${pending.toolName}\nStatus: ${approved ? "Approved" : "Denied"}`,
      );
    });

    // Single handler for all text messages — commands and chat
    bot.on("message:text", async (tgCtx) => {
      if (!isAllowed(tgCtx.chat.id)) return;

      const chatId = String(tgCtx.chat.id);
      const text = tgCtx.message.text.trim();

      // Extract command (strip @BotUsername suffix for group commands)
      const command = text.startsWith("/")
        ? text.split(/[\s@]/)[0]!.toLowerCase()
        : null;

      // --- Slash commands ---

      const helpText =
        "Available commands:\n\n" +
        "/help - Show this help message\n" +
        "/new - Start a fresh conversation\n" +
        "/status - Check connection status\n" +
        "/inbox - Show recent inbox items\n\n" +
        "Or just send a message to chat with Talos. " +
        "In group chats, @mention or reply to the bot.";

      if (command === "/start") {
        knownChatIds.add(chatId);
        ctx.log.info(`New chat registered: ${tgCtx.chat.id}`);
        await tgCtx.reply(
          "Hello! I'm Talos, your AI chief of staff.\n\n" + helpText,
        );
        return;
      }

      if (command === "/help") {
        await tgCtx.reply(helpText);
        return;
      }

      if (command === "/new") {
        knownChatIds.add(chatId);
        await ctx.newConversation(chatId);
        await tgCtx.reply("Started a new conversation. Send me a message!");
        return;
      }

      if (command === "/status") {
        await tgCtx.reply("Talos is connected and ready.");
        return;
      }

      if (command === "/inbox") {
        try {
          const { db, schema } = await import("../../apps/server/src/db/index.js");

          const items = db
            .select()
            .from(schema.inbox)
            .all()
            .sort((a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 5);

          if (items.length === 0) {
            await tgCtx.reply("Your inbox is empty.");
            return;
          }

          const lines = items.map((item: { title: string; isRead: boolean; summary: string | null; content: string }, i: number) => {
            const readMark = item.isRead ? "" : " [NEW]";
            const summary = item.summary ?? item.content.slice(0, 80);
            return `${i + 1}. ${item.title}${readMark}\n   ${summary}`;
          });

          await tgCtx.reply(`Recent inbox items:\n\n${lines.join("\n\n")}`);
        } catch (err) {
          ctx.log.error(`Inbox error: ${err instanceof Error ? err.message : String(err)}`);
          await tgCtx.reply("Failed to load inbox.");
        }
        return;
      }

      // Skip unknown commands
      if (command) return;

      // --- Regular chat messages ---

      // In groups, only respond when @mentioned or replied to
      if (tgCtx.chat.type === "group" || tgCtx.chat.type === "supergroup") {
        const isReply = tgCtx.message.reply_to_message?.from?.username === botUsername;
        const isMentioned = botUsername && text.includes(`@${botUsername}`);
        if (!isReply && !isMentioned) return;
      }

      knownChatIds.add(chatId);

      // Remove @mention from the text for cleaner input
      const cleanText = botUsername
        ? text.replace(new RegExp(`@${botUsername}\\b`, "g"), "").trim()
        : text;

      if (!cleanText) return;

      // Send typing indicator
      await tgCtx.replyWithChatAction("typing");

      // Keep typing indicator alive during processing
      const typingInterval = setInterval(() => {
        tgCtx.replyWithChatAction("typing").catch(() => {});
      }, 4000);

      try {
        const conversationId = await ctx.resolveConversation(chatId);

        // Create approval gate for this chat
        const approvalGate = async (toolName: string, args: Record<string, unknown>) => {
          const approvalId = crypto.randomUUID().slice(0, 8);

          const keyboard = new InlineKeyboard()
            .text("Approve", `approve:${approvalId}`)
            .text("Deny", `deny:${approvalId}`);

          const argsPreview = JSON.stringify(args, null, 2).slice(0, 200);
          await tgCtx.reply(
            `Tool: ${toolName}\nArgs: ${argsPreview}`,
            { reply_markup: keyboard },
          );

          return new Promise<boolean>((resolve) => {
            pendingApprovals.set(approvalId, { resolve, toolName });

            // Auto-deny after 5 minutes
            setTimeout(() => {
              if (pendingApprovals.has(approvalId)) {
                pendingApprovals.delete(approvalId);
                resolve(false);
              }
            }, 5 * 60 * 1000);
          });
        };

        const result = await ctx.chat(conversationId, cleanText, approvalGate);

        // Send response, splitting if necessary
        const parts = splitMessage(result.content);
        for (const part of parts) {
          await tgCtx.reply(part);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "An error occurred";
        ctx.log.error(`Chat error: ${message}`);
        await tgCtx.reply(`Error: ${message}`);
      } finally {
        clearInterval(typingInterval);
      }
    });

    // Store bot reference and knownChatIds for notify and stop
    (handler as TelegramHandlerState)._bot = bot;
    (handler as TelegramHandlerState)._knownChatIds = knownChatIds;

    // Start polling
    const me = await bot.api.getMe();
    botUsername = me.username;
    ctx.log.info(`Telegram bot started as @${botUsername}`);

    bot.start({
      drop_pending_updates: true,
      onStart: () => ctx.log.info("Telegram bot polling started"),
    });
  },

  async stop() {
    const bot = (handler as TelegramHandlerState)._bot;
    if (bot) {
      await bot.stop();
      (handler as TelegramHandlerState)._bot = undefined;
      (handler as TelegramHandlerState)._knownChatIds = undefined;
    }
  },

  async notify(item: InboxItem) {
    const bot = (handler as TelegramHandlerState)._bot;
    const knownChatIds = (handler as TelegramHandlerState)._knownChatIds;
    if (!bot || !knownChatIds) return;

    const emoji = item.type === "task_result"
      ? (item.title.startsWith("Task failed") ? "\u274c" : "\u2705")
      : "\u{1f4ec}";

    const text = `${emoji} ${item.title}\n\n${item.summary ?? item.content.slice(0, 500)}`;

    for (const chatId of knownChatIds) {
      try {
        const parts = splitMessage(text);
        for (const part of parts) {
          await bot.api.sendMessage(Number(chatId), part);
        }
      } catch (err) {
        // Best effort — chat may have been deleted
      }
    }
  },
};

interface TelegramHandlerState {
  _bot?: Bot;
  _knownChatIds?: Set<string>;
}
