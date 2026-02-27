import { useState, useRef, useCallback, useEffect } from "react"
import { useChatStore, useConnectionStore } from "@/stores"
import { useVoiceStore } from "@/stores/useVoiceStore"
import { voiceApi } from "@/api/voice"
import { VADDetector } from "@/utils/vadDetector"
import { SentenceChunker } from "@/utils/sentenceChunker"
import { TTSQueue } from "@/utils/ttsQueue"
import { WebRTCLoopbackPlayer } from "@/utils/webrtcLoopback"
import { stopAutoTts } from "@/utils/ttsPlayer"
import {
  subscribeToMessages,
  setVoiceConversationActive,
} from "@/hooks/useWebSocket"

export type VoiceConversationState =
  | "idle"
  | "listening"
  | "recording"
  | "transcribing"
  | "waiting_for_response"
  | "speaking"

export interface UseVoiceConversationReturn {
  state: VoiceConversationState
  isActive: boolean
  toggle: () => void
}

function detectMimeType(): string {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus"
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4"
  }
  return "audio/webm"
}

export function useVoiceConversation(): UseVoiceConversationReturn {
  const [state, setState] = useState<VoiceConversationState>("idle")

  // Use a ref mirror so async callbacks always see current state
  const stateRef = useRef<VoiceConversationState>("idle")
  const setStateSync = useCallback((next: VoiceConversationState) => {
    stateRef.current = next
    setState(next)
  }, [])

  // Long-lived audio resources (persist for entire conversation session)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const vadRef = useRef<VADDetector | null>(null)

  // Per-utterance recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>("audio/webm")

  // TTS + sentence chunking + echo cancellation
  const loopbackPlayerRef = useRef<WebRTCLoopbackPlayer | null>(null)
  const ttsQueueRef = useRef<TTSQueue | null>(null)
  const sentenceChunkerRef = useRef<SentenceChunker | null>(null)
  const unsubMessagesRef = useRef<(() => void) | null>(null)

  // Track whether the stream has ended (so we know when TTS queue draining = done)
  const streamEndedRef = useRef(false)

  // ─── Recording helpers ────────────────────────────────────

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.start()
  }, [])

  const stopRecording = useCallback((): Blob | null => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") return null

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
        chunksRef.current = []
        mediaRecorderRef.current = null
        resolve(blob.size > 0 ? blob : null)
      }
      recorder.stop()
    }) as unknown as Blob | null // handled via async wrapper below
  }, [])

  // Async wrapper that returns a promise for the recorded blob
  const stopRecordingAsync = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null)
    }

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
        chunksRef.current = []
        mediaRecorderRef.current = null
        resolve(blob.size > 0 ? blob : null)
      }
      recorder.stop()
    })
  }, [])

  // ─── Submit transcript as chat message ────────────────────

  const submitTranscript = useCallback(async (text: string) => {
    const chatStore = useChatStore.getState()
    const connStore = useConnectionStore.getState()

    let conversationId = chatStore.activeConversationId

    if (!conversationId) {
      try {
        const title = text.length > 50 ? text.slice(0, 50) + "..." : text
        const conv = await chatStore.createConversation(title)
        conversationId = conv.id
      } catch (err) {
        console.error("[VoiceConv] Failed to create conversation:", err)
        return
      }
    }

    chatStore.addMessage({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    })

    connStore.send({ type: "chat", conversationId, content: text })
  }, [])

  // ─── Transition: user finished speaking → transcribe → send ──

  const handleSpeechEnd = useCallback(async () => {
    if (stateRef.current !== "recording") return

    setStateSync("transcribing")

    const blob = await stopRecordingAsync()
    if (!blob) {
      setStateSync("listening")
      vadRef.current?.resetSilenceTimer()
      return
    }

    try {
      const result = await voiceApi.transcribe(blob)
      const text = result.text.trim()

      if (!text) {
        setStateSync("listening")
        vadRef.current?.resetSilenceTimer()
        return
      }

      // Reset for incoming response
      streamEndedRef.current = false
      sentenceChunkerRef.current?.reset()
      ttsQueueRef.current?.reset()

      setStateSync("waiting_for_response")
      await submitTranscript(text)
    } catch (err) {
      console.error("[VoiceConv] Transcription failed:", err)
      setStateSync("listening")
      vadRef.current?.resetSilenceTimer()
    }
  }, [setStateSync, stopRecordingAsync, submitTranscript])

  // ─── Transition: VAD detects speech start ─────────────────

  const handleSpeechStart = useCallback(() => {
    const current = stateRef.current
    console.log("[VoiceConv] VAD onSpeechStart — state:", current)

    if (current === "listening") {
      setStateSync("recording")
      startRecording()
    } else if (current === "speaking") {
      // User is interrupting the AI response
      console.log("[VoiceConv] Interrupting TTS (user spoke during playback)")
      ttsQueueRef.current?.interrupt()
      sentenceChunkerRef.current?.reset()
      setStateSync("recording")
      startRecording()
    }
  }, [setStateSync, startRecording])

  // ─── Setup / teardown conversation mode ───────────────────

  const startConversation = useCallback(async () => {
    try {
      // Stop any existing auto-TTS
      stopAutoTts()

      // Acquire mic with echo cancellation
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      mimeTypeRef.current = detectMimeType()

      // Audio analysis chain
      const audioCtx = new AudioContext()
      audioContextRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      // Don't connect to destination — no audio output

      // WebRTC loopback for echo-cancelled TTS playback
      const loopbackPlayer = new WebRTCLoopbackPlayer()
      await loopbackPlayer.init()
      loopbackPlayerRef.current = loopbackPlayer
      console.log("[VoiceConv] WebRTC loopback player initialized")

      // TTS queue (routed through loopback for echo cancellation)
      const ttsQueue = new TTSQueue({
        loopbackPlayer,
        onPlaybackComplete: () => {
          console.log("[VoiceConv] TTS queue drained — streamEnded:", streamEndedRef.current, "state:", stateRef.current)
          // If stream has ended and queue is drained → back to listening
          if (streamEndedRef.current && stateRef.current === "speaking") {
            setStateSync("listening")
            vadRef.current?.resetSilenceTimer()
            console.log("[VoiceConv] All TTS done — back to listening")
          }
        },
        onError: (err) => {
          console.warn("[VoiceConv] TTS error:", err.message)
        },
        getPlaybackRate: () => {
          const speed = useVoiceStore.getState().settings?.speed
          return speed ? parseFloat(speed) || 1.0 : 1.0
        },
      })
      ttsQueueRef.current = ttsQueue

      // Sentence chunker — feeds TTS queue
      const chunker = new SentenceChunker((sentence) => {
        ttsQueue.enqueue(sentence)
      })
      sentenceChunkerRef.current = chunker

      // Subscribe to WebSocket messages for streaming chunks
      const unsub = subscribeToMessages((msg) => {
        const s = stateRef.current
        if (s !== "waiting_for_response" && s !== "speaking") return

        if (msg.type === "chunk") {
          if (s === "waiting_for_response") {
            setStateSync("speaking")
            // VAD stays active — WebRTC loopback provides echo cancellation
            console.log("[VoiceConv] Speaking started (VAD active, echo cancelled via WebRTC)")
          }
          chunker.push(msg.content)
        } else if (msg.type === "end") {
          chunker.flush()
          streamEndedRef.current = true
          console.log("[VoiceConv] Stream ended — queue playing:", ttsQueue.playing, "pending:", ttsQueue.pending)
          // If TTS queue is already empty/done, transition immediately
          if (!ttsQueue.playing && ttsQueue.pending === 0) {
            if (stateRef.current === "speaking") {
              setStateSync("listening")
              vadRef.current?.resetSilenceTimer()
              console.log("[VoiceConv] No TTS queued — back to listening")
            }
          }
        } else if (msg.type === "error") {
          // On error, go back to listening
          ttsQueue.interrupt()
          chunker.reset()
          if (stateRef.current !== "idle") {
            setStateSync("listening")
            vadRef.current?.resetSilenceTimer()
          }
        }
      })
      unsubMessagesRef.current = unsub

      // VAD
      const vad = new VADDetector(analyser, {
        silenceTimeoutMs: 3000,
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: () => {
          void handleSpeechEnd()
        },
      })
      vadRef.current = vad
      vad.start()

      setVoiceConversationActive(true)
      setStateSync("listening")
    } catch (err) {
      console.error("[VoiceConv] Failed to start:", err)
      setStateSync("idle")
    }
  }, [setStateSync, handleSpeechStart, handleSpeechEnd])

  const stopConversation = useCallback(() => {
    // VAD
    vadRef.current?.stop()
    vadRef.current = null

    // Recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    chunksRef.current = []

    // TTS + loopback
    ttsQueueRef.current?.interrupt()
    ttsQueueRef.current = null
    sentenceChunkerRef.current?.reset()
    sentenceChunkerRef.current = null
    loopbackPlayerRef.current?.destroy()
    loopbackPlayerRef.current = null

    // Message subscription
    unsubMessagesRef.current?.()
    unsubMessagesRef.current = null

    // Audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null

    // Mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setVoiceConversationActive(false)
    setStateSync("idle")
  }, [setStateSync])

  const toggle = useCallback(() => {
    if (stateRef.current === "idle") {
      void startConversation()
    } else {
      stopConversation()
    }
  }, [startConversation, stopConversation])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stateRef.current !== "idle") {
        stopConversation()
      }
    }
  }, [stopConversation])

  // Exit conversation mode if active conversation changes
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const prevConvRef = useRef(activeConversationId)
  useEffect(() => {
    if (
      prevConvRef.current !== activeConversationId &&
      stateRef.current !== "idle"
    ) {
      stopConversation()
    }
    prevConvRef.current = activeConversationId
  }, [activeConversationId, stopConversation])

  return {
    state,
    isActive: state !== "idle",
    toggle,
  }
}
