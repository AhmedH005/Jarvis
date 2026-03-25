/**
 * voiceService — audio playback layer only.
 *
 * Responsibilities:
 *   - Play raw audio bytes (AudioContext → HTMLAudioElement fallback)
 *   - Native speechSynthesis fallback
 *   - Stop / interrupt active playback
 *
 * This module has NO knowledge of LLM or TTS providers.
 * Provider routing lives in ttsService.ts.
 */
import { getAudioContext } from '@/lib/audio'
import { useVoiceStore } from '@/store/voice'

let currentAudio: HTMLAudioElement | null = null
let currentAudioUrl: string | null = null
let currentSource: AudioBufferSourceNode | null = null

export function cleanupAudio(): void {
  if (currentSource) {
    currentSource.onended = null
    currentSource.disconnect()
    currentSource = null
  }
  if (currentAudio) {
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio = null
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
    currentAudioUrl = null
  }
}

/** Speak text using the browser's native speechSynthesis API. */
export async function speakNative(text: string): Promise<boolean> {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    console.warn('[Voice] speechSynthesis fallback is unavailable')
    return false
  }

  const synth = window.speechSynthesis
  synth.cancel()

  await new Promise<void>((resolve) => {
    if (synth.getVoices().length > 0) return resolve()

    const handleVoicesChanged = () => {
      synth.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve()
    }

    synth.addEventListener('voiceschanged', handleVoicesChanged, { once: true })
    window.setTimeout(() => {
      synth.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve()
    }, 300)
  })

  const utterance = new SpeechSynthesisUtterance(text)
  const voices = synth.getVoices()
  const preferredVoice =
    voices.find((voice) => voice.lang.startsWith('en-GB')) ??
    voices.find((voice) => voice.lang.startsWith('en-US')) ??
    voices.find((voice) => voice.lang.startsWith('en')) ??
    null

  if (preferredVoice) utterance.voice = preferredVoice
  utterance.rate = 0.96
  utterance.pitch = 0.9

  console.log('[Voice] Using speechSynthesis', {
    voice: preferredVoice?.name ?? 'default',
    lang: preferredVoice?.lang ?? 'default',
  })

  await new Promise<void>((resolve, reject) => {
    utterance.onend = () => resolve()
    utterance.onerror = (event) => reject(new Error(`speechSynthesis failed: ${event.error}`))
    synth.speak(utterance)
  })

  return true
}

async function playWithAudioElement(bytes: Uint8Array, mimeType: string): Promise<void> {
  const blobBytes = Uint8Array.from(bytes)
  const blob = new Blob([blobBytes], { type: mimeType })
  console.log('[Voice] created fallback audio blob', { size: blob.size, mimeType })
  if (!blob.size) throw new Error('Refusing to play empty TTS blob')

  const url = URL.createObjectURL(blob)
  currentAudioUrl = url
  currentAudio = new Audio(url)
  currentAudio.preload = 'auto'

  await new Promise<void>((resolve, reject) => {
    if (!currentAudio) return resolve()
    currentAudio.onended = () => {
      cleanupAudio()
      resolve()
    }
    currentAudio.onerror = () => {
      cleanupAudio()
      reject(new Error('Audio playback failed'))
    }
    currentAudio.play()
      .then(() => {
        console.log('[Voice] Fallback HTMLAudio playback started')
      })
      .catch((error) => {
        cleanupAudio()
        reject(error)
      })
  })
}

async function playWithAudioContext(bytes: Uint8Array): Promise<void> {
  const context = getAudioContext()
  if (context.state === 'suspended') await context.resume()

  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  const decoded = await context.decodeAudioData(arrayBuffer)

  await new Promise<void>((resolve) => {
    const source = context.createBufferSource()
    currentSource = source
    source.buffer = decoded
    source.connect(context.destination)
    source.onended = () => {
      if (currentSource === source) currentSource = null
      source.disconnect()
      resolve()
    }
    source.start(0)
    console.log('[Voice] AudioContext playback started', {
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
    })
  })
}

/**
 * Play raw audio bytes.
 * Tries AudioContext first, falls back to HTMLAudioElement.
 * Throws if both fail — caller is responsible for native fallback.
 */
export async function playAudioBytes(bytes: Uint8Array, mimeType: string): Promise<void> {
  try {
    await playWithAudioContext(bytes)
  } catch (audioContextError) {
    console.warn('[Voice] AudioContext playback failed, falling back to HTMLAudio', audioContextError)
    await playWithAudioElement(bytes, mimeType)
  }
}

/** Stop any currently playing Jarvis speech immediately. */
export function stopAudio(): void {
  if (currentSource) {
    try { currentSource.stop(0) } catch { /* source already stopped */ }
  }
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  cleanupAudio()
  useVoiceStore.getState().setVoicePhase('idle')
}

export function isSpeaking(): boolean {
  return useVoiceStore.getState().voicePhase === 'speaking'
}
