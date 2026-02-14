import type { Message } from "@talos/shared/types"
import { ToolCallDisplay } from "./ToolCallDisplay"
import { Markdown } from "./Markdown"

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <span className="mb-1 text-[11px] font-medium text-muted-foreground">
        {isUser ? "You" : "Talos"}
      </span>
      <div
        className={`max-w-[80%] px-4 py-2.5 ${
          isUser
            ? "rounded-2xl rounded-tr-md bg-primary/10 text-foreground"
            : "rounded-2xl rounded-tl-md border border-border/50 bg-card text-foreground"
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 border-b border-border pb-2">
            {message.toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        <Markdown className="text-sm">
          {message.content}
        </Markdown>
        {!isUser && message.usage && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {message.usage.inputTokens.toLocaleString()} in → {message.usage.outputTokens.toLocaleString()} out · {message.usage.totalTokens.toLocaleString()} tokens
            {message.usage.cost != null && ` · $${message.usage.cost.toFixed(4)}`}
          </p>
        )}
      </div>
    </div>
  )
}
