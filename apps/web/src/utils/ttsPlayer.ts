import { useVoiceStore } from "@/stores/useVoiceStore"

let currentAudio: HTMLAudioElement | null = null

function getPlaybackRate(): number {
  const speed = useVoiceStore.getState().settings?.speed
  return speed ? parseFloat(speed) || 1.0 : 1.0
}

export async function autoPlayTts(messageId: string): Promise<void> {
  // Stop any current audio
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  try {
    const res = await fetch(`/api/voice/synthesize/${messageId}`, {
      method: "POST",
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    const rate = getPlaybackRate()
    if (rate !== 1.0) audio.playbackRate = rate
    currentAudio = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      currentAudio = null
    }
    await audio.play()
  } catch {
    // Best-effort -- don't disrupt the chat
  }
}

export function stopAutoTts(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}
