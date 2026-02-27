import { useMemo, useState } from "react"
import { Circle, Loader2, Check, AlertCircle, ChevronRight, Square, Ban, SkipForward, Minus } from "lucide-react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { ToolCallDisplay } from "./ToolCallDisplay"
import type { PlanState, ToolCallInfo } from "@talos/shared/types"

interface PlanDisplayProps {
  plan: PlanState;
  toolCalls: ToolCallInfo[];
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="size-3.5 text-muted-foreground/50" />,
  running: <Loader2 className="size-3.5 animate-spin text-cyan-400" />,
  complete: <Check className="size-3.5 text-green-400" />,
  skipped: <SkipForward className="size-3.5 text-muted-foreground/70" />,
  error: <AlertCircle className="size-3.5 text-red-400" />,
  stopping: <Square className="size-3.5 text-amber-400 animate-pulse" />,
  cancelled: <Ban className="size-3.5 text-muted-foreground/50" />,
  removed: <Minus className="size-3.5 text-muted-foreground/40" />,
}

export function PlanDisplay({ plan, toolCalls }: PlanDisplayProps) {
  // Group tool calls by stepId
  const toolCallsByStep = useMemo(() => {
    const map = new Map<string, ToolCallInfo[]>()
    for (const tc of toolCalls) {
      if (tc.stepId) {
        const existing = map.get(tc.stepId) ?? []
        existing.push(tc)
        map.set(tc.stepId, existing)
      }
    }
    return map
  }, [toolCalls])

  return (
    <div className="my-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Plan: {plan.request}
      </p>
      <div className="space-y-0">
        {plan.steps.map((step, idx) => (
          <PlanStepRow
            key={step.id}
            step={step}
            isLast={idx === plan.steps.length - 1}
            toolCalls={toolCallsByStep.get(step.id) ?? []}
          />
        ))}
      </div>
    </div>
  )
}

interface PlanStepRowProps {
  step: PlanState["steps"][number];
  isLast: boolean;
  toolCalls: ToolCallInfo[];
}

function stepTextClass(status: string): string {
  switch (status) {
    case "pending":
    case "cancelled":
    case "skipped":
      return "text-muted-foreground/50"
    case "removed":
      return "text-muted-foreground/40 line-through"
    case "stopping":
      return "text-amber-400/90"
    default:
      return "text-foreground/90"
  }
}

/** Extract a human-readable error message. Failure reports contain a `conclusion` field. */
function formatStepError(error: string): string {
  try {
    const parsed = JSON.parse(error) as Record<string, unknown>
    if (parsed["type"] === "failure_report" && typeof parsed["conclusion"] === "string") {
      return parsed["conclusion"]
    }
  } catch {
    // Not JSON — use as-is
  }
  return error
}

function PlanStepRow({ step, isLast, toolCalls }: PlanStepRowProps) {
  const [open, setOpen] = useState(() => step.status === "running")
  const hasToolCalls = toolCalls.length > 0
  const hasError = step.status === "error" && step.error
  const isCollapsible = hasToolCalls || hasError

  // Auto-expand running and stopping steps
  const isActive = step.status === "running" || step.status === "stopping"

  const label = step.status === "stopping"
    ? `${step.description} — stopping…`
    : step.status === "cancelled"
      ? `${step.description} — cancelled`
      : step.status === "skipped"
        ? `${step.description} — skipped`
        : step.status === "removed"
          ? `${step.description} — removed`
          : step.description

  return (
    <div className="flex">
      {/* Vertical line + icon */}
      <div className="flex flex-col items-center mr-2.5">
        <div className="flex-shrink-0 mt-0.5">
          {statusIcons[step.status]}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border/50 my-0.5" />
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 pb-2.5">
        {isCollapsible ? (
          <Collapsible open={open || isActive} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs hover:text-foreground transition-colors">
              <ChevronRight
                className={`size-3 transition-transform ${open || isActive ? "rotate-90" : ""}`}
              />
              <span className={stepTextClass(step.status)}>
                {label}
              </span>
              {step.smart && (
                <span className="inline-flex items-center rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                  Smart
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 ml-4">
              {hasError && (
                <p className="text-xs text-red-400/90 mb-1">{formatStepError(step.error!)}</p>
              )}
              {toolCalls.map((tc) => (
                <ToolCallDisplay key={tc.toolCallId} toolCall={tc} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <p className={`text-xs ${stepTextClass(step.status)}`}>
            {label}
            {step.smart && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                Smart
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
