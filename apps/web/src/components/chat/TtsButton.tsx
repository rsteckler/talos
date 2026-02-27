import { useState, useRef, useEffect, useCallback } from "react"
import { Volume2, Square, Loader2, AlertCircle } from "lucide-react"
import { voiceApi } from "@/api/voice"

interface TtsButtonProps {
  messageId: string
  text: string
}

type TtsState = "idle" | "loading" | "playing" | "error"

export function TtsButton({ messageId, text }: TtsButtonProps) {
  const [state, setState] = useState<TtsState>("idle")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupAudio()
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [cleanupAudio])

  const handleClick = async () => {
    if (state === "playing") {
      cleanupAudio()
      setState("idle")
      return
    }

    if (state === "loading") return

    setState("loading")
    try {
      const blob = messageId.startsWith("streaming-")
        ? await voiceApi.synthesize(text)
        : await voiceApi.synthesizeMessage(messageId)

      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        cleanupAudio()
        setState("idle")
      }

      audio.onerror = () => {
        cleanupAudio()
        setState("error")
        errorTimeoutRef.current = setTimeout(() => setState("idle"), 2000)
      }

      await audio.play()
      setState("playing")
    } catch {
      cleanupAudio()
      setState("error")
      errorTimeoutRef.current = setTimeout(() => setState("idle"), 2000)
    }
  }

  const isClickable = state === "idle" || state === "playing"

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isClickable}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
        state === "playing"
          ? "text-primary hover:text-primary/80 hover:bg-accent"
          : state === "error"
            ? "text-red-400"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
      title={
        state === "playing"
          ? "Stop playback"
          : state === "loading"
            ? "Loading audio..."
            : state === "error"
              ? "Playback failed"
              : "Read aloud"
      }
    >
      {state === "idle" && <Volume2 className="size-3.5" />}
      {state === "loading" && <Loader2 className="size-3.5 animate-spin" />}
      {state === "playing" && <Square className="size-3" fill="currentColor" />}
      {state === "error" && <AlertCircle className="size-3.5" />}
    </button>
  )
}
