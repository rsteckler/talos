import { useState, useRef, useEffect, useCallback } from "react"
import { Mic, Square, Loader2, AlertCircle } from "lucide-react"
import { voiceApi } from "@/api/voice"

interface VoiceMicButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

type RecordingState = "idle" | "recording" | "transcribing" | "error"

const CANVAS_W = 120
const CANVAS_H = 28
const BAR_COUNT = 24
const BAR_GAP = 1.5
const BAR_COLOR = "#f87171" // red-400

function detectMimeType(): string {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus"
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4"
  }
  return "audio/webm"
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function VoiceMicButton({ onTranscript, disabled }: VoiceMicButtonProps) {
  const [state, setState] = useState<RecordingState>("idle")
  const [duration, setDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const stopVisualization = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  const startVisualization = useCallback((stream: MediaStream) => {
    const audioCtx = new AudioContext()
    audioContextRef.current = audioCtx
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyserRef.current = analyser

    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)
    // Don't connect analyser to destination — no audio output

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const dpr = window.devicePixelRatio || 1

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      analyser.getByteFrequencyData(dataArray)

      const w = CANVAS_W * dpr
      const h = CANVAS_H * dpr
      canvas.width = w
      canvas.height = h

      ctx.clearRect(0, 0, w, h)

      const barWidth = (w - BAR_GAP * dpr * (BAR_COUNT - 1)) / BAR_COUNT
      const minBarH = 2 * dpr

      for (let i = 0; i < BAR_COUNT; i++) {
        // Sample from lower frequency range (voice-relevant bins)
        const val = dataArray[i + 2] ?? 0 // skip DC + first bin
        const normalized = val / 255
        const barH = Math.max(normalized * h, minBarH)
        const x = i * (barWidth + BAR_GAP * dpr)
        const y = (h - barH) / 2 // center vertically

        ctx.fillStyle = BAR_COLOR
        ctx.beginPath()
        const radius = Math.min(barWidth / 2, 1.5 * dpr)
        ctx.roundRect(x, y, barWidth, barH, radius)
        ctx.fill()
      }
    }

    draw()
  }, [])

  const cleanup = useCallback(() => {
    stopVisualization()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    chunksRef.current = []
  }, [stopVisualization])

  useEffect(() => {
    return () => {
      cleanup()
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [cleanup])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = detectMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        stopVisualization()
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []

        // Release mic
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        if (blob.size === 0) {
          setState("idle")
          return
        }

        setState("transcribing")
        try {
          const result = await voiceApi.transcribe(blob)
          if (result.text.trim()) {
            onTranscript(result.text.trim())
          }
          setState("idle")
        } catch {
          setState("error")
          errorTimeoutRef.current = setTimeout(() => setState("idle"), 2000)
        }
      }

      recorder.start()
      setDuration(0)
      setState("recording")

      // Start audio visualization
      startVisualization(stream)

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch {
      setState("error")
      errorTimeoutRef.current = setTimeout(() => setState("idle"), 2000)
    }
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
  }

  const handleClick = () => {
    if (state === "recording") {
      stopRecording()
    } else if (state === "idle") {
      startRecording()
    }
  }

  const isClickable = state === "idle" || state === "recording"

  return (
    <div className="flex items-center gap-1.5">
      {state === "recording" && (
        <>
          <canvas
            ref={canvasRef}
            style={{ width: CANVAS_W, height: CANVAS_H }}
            className="shrink-0"
          />
          <span className="text-xs tabular-nums text-red-400">
            {formatDuration(duration)}
          </span>
        </>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || !isClickable}
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
          state === "recording"
            ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
            : state === "error"
              ? "text-red-400"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        title={
          state === "recording"
            ? "Stop recording"
            : state === "transcribing"
              ? "Transcribing..."
              : state === "error"
                ? "Transcription failed"
                : "Record voice message"
        }
      >
        {state === "idle" && <Mic className="size-4" />}
        {state === "recording" && (
          <Square className="size-3.5 animate-pulse" fill="currentColor" />
        )}
        {state === "transcribing" && (
          <Loader2 className="size-4 animate-spin" />
        )}
        {state === "error" && <AlertCircle className="size-4" />}
      </button>
    </div>
  )
}
