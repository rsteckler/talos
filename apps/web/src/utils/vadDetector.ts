export interface VADConfig {
  /** Minimum average energy (0–255) to consider speech. Default: 30 */
  energyThreshold?: number
  /** Number of low-frequency bins to analyze (voice-relevant). Default: 20 */
  speechBins?: number
  /** Silence duration (ms) before triggering end-of-speech. Default: 3000 */
  silenceTimeoutMs?: number
  /** Minimum speech duration (ms) to avoid noise pops triggering. Default: 300 */
  speechMinMs?: number
  onSpeechStart: () => void
  onSpeechEnd: () => void
}

const DEFAULTS = {
  energyThreshold: 30,
  speechBins: 20,
  silenceTimeoutMs: 3000,
  speechMinMs: 300,
} as const

export class VADDetector {
  private analyser: AnalyserNode
  private dataArray: Uint8Array<ArrayBuffer>
  private config: Required<VADConfig>

  private isSpeaking = false
  private speechStartTime = 0
  private lastSpeechTime = 0
  private rafId: number | null = null

  constructor(analyser: AnalyserNode, config: VADConfig) {
    this.analyser = analyser
    this.dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    this.config = {
      energyThreshold: config.energyThreshold ?? DEFAULTS.energyThreshold,
      speechBins: config.speechBins ?? DEFAULTS.speechBins,
      silenceTimeoutMs: config.silenceTimeoutMs ?? DEFAULTS.silenceTimeoutMs,
      speechMinMs: config.speechMinMs ?? DEFAULTS.speechMinMs,
      onSpeechStart: config.onSpeechStart,
      onSpeechEnd: config.onSpeechEnd,
    }
  }

  start(): void {
    if (this.rafId !== null) return
    this.tick()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.isSpeaking = false
  }

  /** Reset silence timer without stopping VAD (e.g., when re-entering listening state). */
  resetSilenceTimer(): void {
    this.isSpeaking = false
    this.speechStartTime = 0
    this.lastSpeechTime = 0
  }

  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick)

    this.analyser.getByteFrequencyData(this.dataArray)

    // Average energy across voice-relevant bins (skip DC + first bin)
    let sum = 0
    const end = Math.min(this.config.speechBins + 2, this.dataArray.length)
    for (let i = 2; i < end; i++) {
      sum += this.dataArray[i]!
    }
    const avgEnergy = sum / this.config.speechBins

    const now = performance.now()

    if (avgEnergy > this.config.energyThreshold) {
      this.lastSpeechTime = now
      if (!this.isSpeaking) {
        this.speechStartTime = now
        this.isSpeaking = true
        this.config.onSpeechStart()
      }
    } else if (this.isSpeaking) {
      const silenceDuration = now - this.lastSpeechTime
      const speechDuration = this.lastSpeechTime - this.speechStartTime
      if (
        silenceDuration >= this.config.silenceTimeoutMs &&
        speechDuration >= this.config.speechMinMs
      ) {
        this.isSpeaking = false
        this.config.onSpeechEnd()
      }
    }
  }
}
