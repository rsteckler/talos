import { voiceApi } from "@/api/voice"
import type { WebRTCLoopbackPlayer } from "./webrtcLoopback"

export interface TTSQueueOptions {
  onPlaybackStart?: () => void
  onPlaybackComplete?: () => void
  onError?: (error: Error) => void
  /** Returns the current playback rate (read each time a sentence plays). */
  getPlaybackRate?: () => number
  /** When provided, audio is routed through WebRTC loopback for echo cancellation. */
  loopbackPlayer?: WebRTCLoopbackPlayer
}

/**
 * Sequential audio playback queue for incremental TTS.
 * Sentences are synthesized and played in order.
 * Supports immediate interruption (e.g., when user starts speaking).
 */
export class TTSQueue {
  private queue: string[] = []
  private currentAudio: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null
  private isPlaying = false
  private isStopped = false
  private options: TTSQueueOptions

  constructor(options: TTSQueueOptions = {}) {
    this.options = options
  }

  /** Add a sentence to the queue. Starts playback if not already playing. */
  enqueue(text: string): void {
    if (this.isStopped) return
    this.queue.push(text)
    if (!this.isPlaying) {
      void this.playNext()
    }
  }

  /** Immediately stop playback and discard all queued items. */
  interrupt(): void {
    this.isStopped = true
    this.queue = []
    this.options.loopbackPlayer?.stop()
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.onended = null
      this.currentAudio.onerror = null
      this.currentAudio = null
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }
    this.isPlaying = false
  }

  /** Reset for reuse after interrupt or completion. */
  reset(): void {
    this.interrupt()
    this.isStopped = false
  }

  get playing(): boolean {
    return this.isPlaying
  }

  get pending(): number {
    return this.queue.length
  }

  private async playNext(): Promise<void> {
    if (this.isStopped || this.queue.length === 0) {
      this.isPlaying = false
      this.options.onPlaybackComplete?.()
      return
    }

    this.isPlaying = true
    const text = this.queue.shift()!

    try {
      const blob = await voiceApi.synthesize(text)
      if (this.isStopped) return

      const rate = this.options.getPlaybackRate?.() ?? 1.0

      this.options.onPlaybackStart?.()

      if (this.options.loopbackPlayer) {
        // Route through WebRTC loopback for echo cancellation
        await this.options.loopbackPlayer.play(blob, { playbackRate: rate })
      } else {
        // Direct playback (used outside conversation mode)
        const url = URL.createObjectURL(blob)
        this.currentObjectUrl = url

        const audio = new Audio(url)
        if (rate !== 1.0) audio.playbackRate = rate
        this.currentAudio = audio

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve()
          audio.onerror = () => reject(new Error("Audio playback error"))
          audio.play().catch(reject)
        })

        URL.revokeObjectURL(url)
        this.currentObjectUrl = null
        this.currentAudio = null
      }

      await this.playNext()
    } catch (error) {
      if (this.isStopped) return

      this.options.onError?.(
        error instanceof Error ? error : new Error("TTS playback failed"),
      )
      // Skip failed sentence, continue with next
      this.currentAudio = null
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl)
        this.currentObjectUrl = null
      }
      await this.playNext()
    }
  }
}
