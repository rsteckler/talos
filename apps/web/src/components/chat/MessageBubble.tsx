import type { Message } from "@talos/shared/types"
import { User, Bot } from "lucide-react"
import { ToolCallDisplay } from "./ToolCallDisplay"

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary" : "bg-muted"
        }`}
      >
        {isUser ? (
          <User className="size-4 text-primary-foreground" />
        ) : (
          <Bot className="size-4 text-muted-foreground" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
          isUser
            ? "bg-primary/20 text-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <p className="text-xs font-medium mb-1 text-muted-foreground">
          {isUser ? "You" : "Talos"}
        </p>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 border-b border-border pb-2">
            {message.toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
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
