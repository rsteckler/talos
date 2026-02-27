export interface VADConfig {
  /** Minimum energy floor (0–255) — never goes below this. Default: 45 */
  energyThreshold?: number
  /** Number of low-frequency bins to analyze (voice-relevant). Default: 20 */
  speechBins?: number
  /** Silence duration (ms) before triggering end-of-speech. Default: 3000 */
  silenceTimeoutMs?: number
  /** Minimum speech duration (ms) to avoid noise pops triggering. Default: 500 */
  speechMinMs?: number
  /** Fraction of calibrated voice energy used as threshold (0–1). Default: 0.35 */
  adaptiveFactor?: number
  onSpeechStart: () => void
  onSpeechEnd: () => void
}

const DEFAULTS = {
  energyThreshold: 45,
  speechBins: 20,
  silenceTimeoutMs: 3000,
  speechMinMs: 500,
  adaptiveFactor: 0.35,
} as const

/**
 * Voice Activity Detector with adaptive threshold calibration.
 *
 * Monitors an AnalyserNode for voice-frequency energy. During confirmed
 * speech, it tracks the user's average speaking volume in a rolling window
 * and adjusts the detection threshold to a fraction of that level. This
 * prevents ambient noise and TTS echo from triggering false positives
 * while remaining sensitive to the user's actual voice.
 */
export class VADDetector {
  private analyser: AnalyserNode
  private dataArray: Uint8Array<ArrayBuffer>
  private config: Required<VADConfig>

  private isSpeaking = false
  private speechStartTime = 0
  private lastSpeechTime = 0
  private rafId: number | null = null

  // Adaptive calibration: rolling window of energy samples during confirmed speech
  private energySamples: number[] = []
  private calibratedEnergy = 0
  private readonly maxSamples = 150 // ~2.5s at 60fps

  constructor(analyser: AnalyserNode, config: VADConfig) {
    this.analyser = analyser
    this.dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    this.config = {
      energyThreshold: config.energyThreshold ?? DEFAULTS.energyThreshold,
      speechBins: config.speechBins ?? DEFAULTS.speechBins,
      silenceTimeoutMs: config.silenceTimeoutMs ?? DEFAULTS.silenceTimeoutMs,
      speechMinMs: config.speechMinMs ?? DEFAULTS.speechMinMs,
      adaptiveFactor: config.adaptiveFactor ?? DEFAULTS.adaptiveFactor,
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

  /** Current adaptive threshold (for debugging). */
  get threshold(): number {
    return this.getAdaptiveThreshold()
  }

  /** Current calibrated average voice energy (for debugging). */
  get voiceEnergy(): number {
    return this.calibratedEnergy
  }

  private getAdaptiveThreshold(): number {
    if (this.calibratedEnergy <= 0) {
      return this.config.energyThreshold
    }
    // Use a fraction of the calibrated voice energy, floored by the minimum
    return Math.max(
      this.config.energyThreshold,
      this.calibratedEnergy * this.config.adaptiveFactor,
    )
  }

  private updateCalibration(energy: number): void {
    this.energySamples.push(energy)
    if (this.energySamples.length > this.maxSamples) {
      this.energySamples.shift()
    }
    // Compute mean
    let sum = 0
    for (const s of this.energySamples) sum += s
    this.calibratedEnergy = sum / this.energySamples.length
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
    const activeThreshold = this.getAdaptiveThreshold()

    if (avgEnergy > activeThreshold) {
      this.lastSpeechTime = now
      if (!this.isSpeaking) {
        this.speechStartTime = now
        this.isSpeaking = true
        this.config.onSpeechStart()
      }
      // Calibrate during confirmed speech (after minimum duration to avoid noise)
      if (now - this.speechStartTime > this.config.speechMinMs) {
        this.updateCalibration(avgEnergy)
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
