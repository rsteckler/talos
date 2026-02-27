import { AudioLines, Loader2 } from "lucide-react"
import type { VoiceConversationState } from "@/hooks/useVoiceConversation"

interface VoiceConversationButtonProps {
  state: VoiceConversationState
  onToggle: () => void
  disabled?: boolean
}

export function VoiceConversationButton({
  state,
  onToggle,
  disabled,
}: VoiceConversationButtonProps) {
  const isActive = state !== "idle"
  const isProcessing = state === "transcribing" || state === "waiting_for_response"

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive
          ? state === "recording"
            ? "text-green-400 bg-green-500/15 hover:bg-green-500/20"
            : state === "speaking"
              ? "text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/15"
              : "text-green-400 hover:bg-green-500/10"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
      title={
        isActive
          ? "Stop voice conversation"
          : "Start voice conversation"
      }
    >
      {isProcessing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <AudioLines
          className={`size-4 ${
            state === "recording"
              ? "animate-pulse"
              : state === "listening"
                ? "animate-[pulse_2s_ease-in-out_infinite]"
                : ""
          }`}
        />
      )}
    </button>
  )
}
