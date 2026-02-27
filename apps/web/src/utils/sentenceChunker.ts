type SentenceCallback = (sentence: string) => void

/** Maximum buffer length before forcing a flush (handles code blocks, lists, etc.) */
const MAX_BUFFER_LENGTH = 200

/**
 * Buffers streaming text chunks and emits complete sentences for TTS synthesis.
 * Splits on sentence-ending punctuation followed by whitespace + uppercase letter.
 */
export class SentenceChunker {
  private buffer = ""
  private onSentence: SentenceCallback

  constructor(onSentence: SentenceCallback) {
    this.onSentence = onSentence
  }

  /** Feed a new text chunk from the stream. */
  push(chunk: string): void {
    this.buffer += chunk
    this.extractSentences()
  }

  /** Emit any remaining buffered text (call when stream ends). */
  flush(): void {
    const remaining = this.buffer.trim()
    if (remaining.length > 0) {
      this.onSentence(remaining)
    }
    this.buffer = ""
  }

  /** Discard all buffered text (call on interruption). */
  reset(): void {
    this.buffer = ""
  }

  private extractSentences(): void {
    // Try to find sentence boundaries: punctuation followed by whitespace + uppercase
    // or punctuation followed by newline
    const pattern = /([.!?])\s+(?=[A-Z"\u201C(])|([.!?])\n/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(this.buffer)) !== null) {
      // Include the punctuation in the sentence
      const end = match.index + 1
      const sentence = this.buffer.slice(lastIndex, end).trim()
      if (sentence.length > 0) {
        this.onSentence(sentence)
      }
      lastIndex = end
    }

    if (lastIndex > 0) {
      this.buffer = this.buffer.slice(lastIndex)
    }

    // Safety: if buffer is very long without any sentence boundary, flush it
    if (this.buffer.length > MAX_BUFFER_LENGTH) {
      // Try to split at the last whitespace
      const lastSpace = this.buffer.lastIndexOf(" ")
      if (lastSpace > 0) {
        const chunk = this.buffer.slice(0, lastSpace).trim()
        if (chunk.length > 0) {
          this.onSentence(chunk)
        }
        this.buffer = this.buffer.slice(lastSpace + 1)
      } else {
        // No whitespace — flush the whole buffer
        this.onSentence(this.buffer.trim())
        this.buffer = ""
      }
    }
  }
}
