/**
 * WebRTC loopback player for echo-cancelled audio playback.
 *
 * Routes audio through a local RTCPeerConnection pair so Chromium's
 * built-in AEC can use the playback signal as a reference — preventing
 * the microphone from picking up TTS output as "speech".
 *
 * Flow: AudioBuffer → BufferSource → MediaStreamDestination → senderPC → receiverPC → <audio>
 *
 * The mic's getUserMedia({ echoCancellation: true }) then has a proper
 * reference signal to subtract from the mic input.
 */

export class WebRTCLoopbackPlayer {
  private senderPC: RTCPeerConnection | null = null
  private receiverPC: RTCPeerConnection | null = null
  private outputAudio: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
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

    // Persistent AudioContext for decoding and streaming audio
    const audioCtx = new AudioContext()
    this.audioCtx = audioCtx

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

    // Bootstrap the connection with a silent track from a MediaStreamDestination
    const dest = audioCtx.createMediaStreamDestination()
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

    this.ready = true
  }

  /**
   * Play an audio blob through the WebRTC loopback.
   * Decodes the blob into an AudioBuffer, streams it via Web Audio API
   * through the RTCPeerConnection, and plays on the receiver side.
   * Returns a promise that resolves when playback finishes.
   */
  async play(
    blob: Blob,
    options?: { playbackRate?: number },
  ): Promise<void> {
    if (!this.ready || !this.senderPC || !this.audioCtx) {
      throw new Error("WebRTCLoopbackPlayer not initialized")
    }

    // Decode the audio blob into an AudioBuffer
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer)

    // Create a buffer source → MediaStreamDestination to get a proper track
    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    const rate = options?.playbackRate ?? 1.0
    if (rate !== 1.0) source.playbackRate.value = rate

    const dest = this.audioCtx.createMediaStreamDestination()
    source.connect(dest)

    const track = dest.stream.getAudioTracks()[0]
    if (!track) throw new Error("No audio track from buffer source")

    // Replace the sender's track with this audio track
    const senders = this.senderPC.getSenders()
    const audioSender = senders.find((s) => s.track?.kind === "audio")
    if (audioSender) {
      await audioSender.replaceTrack(track)
    } else {
      this.senderPC.addTrack(track, dest.stream)
    }

    this.currentSource = source

    // Start playback and wait for it to finish
    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.currentSource = null
        resolve()
      }
      source.start()
    })
  }

  /**
   * Stop any currently playing audio immediately.
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch {
        // Already stopped
      }
      this.currentSource = null
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
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {})
      this.audioCtx = null
    }

    this.ready = false
    this.readyPromise = null
  }
}
