import type { ChannelManifest, InboxItem, ToolLogger } from "@talos/shared/types";
import type { ApprovalGate } from "../tools/index.js";

export interface ChannelHandler {
  start(credentials: Record<string, string>, settings: Record<string, string>, ctx: ChannelContext): Promise<void>;
  stop(): Promise<void>;
  notify?(item: InboxItem): Promise<void>;
}

export interface ChannelContext {
  chat(conversationId: string, userContent: string, approvalGate?: ApprovalGate): Promise<{ messageId: string; content: string }>;
  resolveConversation(externalChatId: string): Promise<string>;
  newConversation(externalChatId: string): Promise<string>;
  log: ToolLogger;
}

export interface LoadedChannel {
  manifest: ChannelManifest;
  handler: ChannelHandler;
}
