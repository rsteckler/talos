import { useMemo } from "react"
import type { Message } from "@talos/shared/types"
import { useLayoutStore } from "@/stores"
import { ToolCallDisplay } from "./ToolCallDisplay"
import { PlanDisplay } from "./PlanDisplay"
import { Markdown } from "./Markdown"
import { TtsButton } from "./TtsButton"

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const isError = message.isError === true
  const voiceActive = useLayoutStore((s) => s.voiceConversationActive)

  const bubbleClass = isUser
    ? "rounded-2xl rounded-tr-md bg-primary/10 text-foreground"
    : isError
      ? "rounded-2xl rounded-tl-md border border-destructive/30 bg-destructive/5 text-foreground"
      : "rounded-2xl rounded-tl-md border border-border/50 bg-card text-foreground"

  // Separate plan-associated tool calls from standalone ones
  const { planToolCalls, standaloneToolCalls } = useMemo(() => {
    const all = message.toolCalls ?? []
    if (!message.plan?.length) {
      // No plan — filter out plan_actions but show everything else
      return {
        planToolCalls: [],
        standaloneToolCalls: all.filter((tc) => tc.toolName !== "plan_actions"),
      }
    }
    // Has plan — split by stepId
    const planTcs = all.filter((tc) => tc.stepId)
    const standalone = all.filter((tc) => !tc.stepId && tc.toolName !== "plan_actions")
    return { planToolCalls: planTcs, standaloneToolCalls: standalone }
  }, [message.toolCalls, message.plan])

  // Hide empty assistant bubbles (e.g., plan_actions placeholder before plan/text arrives)
  const hasVisibleContent =
    message.content.length > 0 ||
    (message.plan && message.plan.length > 0) ||
    standaloneToolCalls.length > 0

  if (!isUser && !hasVisibleContent) return null

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} ${voiceActive ? "opacity-80" : ""}`}>
      <span className="mb-1 text-[11px] font-medium text-muted-foreground">
        {isUser ? "You" : "Talos"}
      </span>
      <div className={`max-w-[80%] px-4 py-2.5 ${bubbleClass}`}>
        {message.plan && message.plan.length > 0 && (
          <div className="mb-2 border-b border-border pb-2">
            {message.plan.map((p, i) => {
              // Scope tool calls to this plan's step IDs to avoid cross-plan collisions
              // (replans reuse step_1, step_2, etc.)
              const stepIds = new Set(p.steps.map((s) => s.id))
              const scopedToolCalls = planToolCalls.filter((tc) => tc.stepId && stepIds.has(tc.stepId))
              return (
                <div key={`${p.request}-${i}`} className={i > 0 ? "border-t border-border/30 pt-2 mt-2" : ""}>
                  <PlanDisplay plan={p} toolCalls={scopedToolCalls} />
                </div>
              )
            })}
          </div>
        )}
        {standaloneToolCalls.length > 0 && (
          <div className="mb-2 border-b border-border pb-2">
            {standaloneToolCalls.map((tc) => (
              <ToolCallDisplay key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        {isError && !isUser && (
          <p className="mb-1 text-xs font-medium text-destructive">Error</p>
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
        {!isUser && message.content.length > 0 && (
          <div className="mt-1 flex justify-end">
            <TtsButton messageId={message.id} text={message.content} />
          </div>
        )}
      </div>
    </div>
  )
}
