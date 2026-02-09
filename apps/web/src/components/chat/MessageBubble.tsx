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
          isUser ? "bg-cyan-600" : "bg-zinc-700"
        }`}
      >
        {isUser ? (
          <User className="size-4 text-white" />
        ) : (
          <Bot className="size-4 text-zinc-300" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
          isUser
            ? "bg-cyan-600/20 text-zinc-100"
            : "bg-zinc-800 text-zinc-200"
        }`}
      >
        <p className="text-xs font-medium mb-1 text-zinc-400">
          {isUser ? "You" : "Talos"}
        </p>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 border-b border-zinc-700 pb-2">
            {message.toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  )
}
