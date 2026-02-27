/**
 * WebRTC loopback player for echo-cancelled audio playback.
 *
 * Routes audio through a local RTCPeerConnection pair so Chromium's
 * built-in AEC can use the playback signal as a reference — preventing
 * the microphone from picking up TTS output as "speech".
 *
 * Flow: AudioElement → captureStream → senderPC → receiverPC → <audio> element
 *
 * The mic's getUserMedia({ echoCancellation: true }) then has a proper
 * reference signal to subtract from the mic input.
 */

export class WebRTCLoopbackPlayer {
  private senderPC: RTCPeerConnection | null = null
  private receiverPC: RTCPeerConnection | null = null
  private outputAudio: HTMLAudioElement | null = null
  private ready = false
  private readyPromise: Promise<void> | null = null

  /**
   * Initialize the WebRTC loopback connection pair.
   * Call once at the start of a voice conversation session.
   */
  async init(): Promise<void> {
    if (this.ready) return
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = this.setup()
    await this.readyPromise
  }

  private async setup(): Promise<void> {
    const sender = new RTCPeerConnection()
    const receiver = new RTCPeerConnection()
    this.senderPC = sender
    this.receiverPC = receiver

    // Forward ICE candidates between the two peers
    sender.onicecandidate = (e) => {
      if (e.candidate) receiver.addIceCandidate(e.candidate).catch(() => {})
    }
    receiver.onicecandidate = (e) => {
      if (e.candidate) sender.addIceCandidate(e.candidate).catch(() => {})
    }

    // When receiver gets a track, play it through an audio element
    // This audio element's output is what the browser's AEC will use as reference
    const trackReady = new Promise<void>((resolve) => {
      receiver.ontrack = (e) => {
        const audio = new Audio()
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track])
        audio.autoplay = true
        this.outputAudio = audio
        resolve()
      }
    })

    // Add a silent audio track to bootstrap the connection
    // We'll replace it with real audio when playing
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const dest = ctx.createMediaStreamDestination()
    oscillator.connect(dest)
    oscillator.start()
    const bootstrapTrack = dest.stream.getAudioTracks()[0]!

    sender.addTrack(bootstrapTrack, dest.stream)

    // SDP exchange
    const offer = await sender.createOffer()
    await sender.setLocalDescription(offer)
    await receiver.setRemoteDescription(offer)

    const answer = await receiver.createAnswer()
    await receiver.setLocalDescription(answer)
    await sender.setRemoteDescription(answer)

    await trackReady

    // Clean up the bootstrap oscillator
    oscillator.stop()
    ctx.close().catch(() => {})

    this.ready = true
  }

  /**
   * Play an audio blob through the WebRTC loopback.
   * Returns a promise that resolves when playback finishes.
   */
  async play(
    blob: Blob,
    options?: { playbackRate?: number },
  ): Promise<void> {
    if (!this.ready || !this.senderPC || !this.outputAudio) {
      throw new Error("WebRTCLoopbackPlayer not initialized")
    }

    const url = URL.createObjectURL(blob)

    try {
      // Create a source audio element and capture its stream
      const sourceAudio = new Audio(url)
      sourceAudio.muted = true // Don't play directly — only through WebRTC
      const rate = options?.playbackRate ?? 1.0
      if (rate !== 1.0) sourceAudio.playbackRate = rate

      // captureStream() gives us a MediaStream of the audio element's output
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capturedStream: MediaStream = (sourceAudio as any).captureStream()
      const capturedTrack = capturedStream.getAudioTracks()[0]
      if (!capturedTrack) throw new Error("No audio track from captured stream")

      // Replace the sender's track with the captured audio track
      const senders = this.senderPC.getSenders()
      const audioSender = senders.find((s) => s.track?.kind === "audio")
      if (audioSender) {
        await audioSender.replaceTrack(capturedTrack)
      } else {
        this.senderPC.addTrack(capturedTrack, capturedStream)
      }

      // Apply playback rate to the output audio too
      if (rate !== 1.0) this.outputAudio.playbackRate = rate

      // Start playback and wait for it to finish
      await new Promise<void>((resolve, reject) => {
        sourceAudio.onended = () => resolve()
        sourceAudio.onerror = () => reject(new Error("Audio playback error"))
        sourceAudio.play().catch(reject)
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  /**
   * Stop any currently playing audio immediately.
   */
  stop(): void {
    if (this.outputAudio) {
      this.outputAudio.pause()
      this.outputAudio.currentTime = 0
    }
  }

  /**
   * Tear down the WebRTC connection pair.
   * Call when the voice conversation session ends.
   */
  destroy(): void {
    this.stop()

    if (this.outputAudio) {
      this.outputAudio.srcObject = null
      this.outputAudio = null
    }
    if (this.senderPC) {
      this.senderPC.close()
      this.senderPC = null
    }
    if (this.receiverPC) {
      this.receiverPC.close()
      this.receiverPC = null
    }

    this.ready = false
    this.readyPromise = null
  }
}
