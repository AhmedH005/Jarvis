/**
 * ttsService — TTS provider routing.
 *
 * Reads ttsProvider from settings and dispatches to:
 *   "basic"      → browser native speechSynthesis (no API key needed)
 *   "elevenlabs" → ElevenLabs API via Electron IPC → audio bytes → playback
 *
 * Audio playback (AudioContext / HTMLAudio) is handled by voiceService.
 * The LLM layer is completely decoupled — this service only cares about text → audio.
 */
import { useVoiceStore } from '@/store/voice'
import { useSettingsStore } from '@/store/settings'
import { speakNative, playAudioBytes, stopAudio, cleanupAudio } from './voiceService'

type ElevenLabsResult =
  | { ok: true; mimeType: string; audioBase64: string; bytes: number }
  | { ok: false; error: string; status?: number }

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function speakElevenLabs(text: string): Promise<void> {
  if (!window.jarvis?.tts) {
    console.warn('[TTS] ElevenLabs: IPC bridge not available, falling back to native')
    await speakNative(text)
    return
  }

  const raw = (await window.jarvis.tts.speak(text)) as ElevenLabsResult | null
  if (!raw) {
    console.warn('[TTS] ElevenLabs: no audio returned')
    await speakNative(text)
    return
  }
  if (!raw.ok) {
    console.error('[TTS] ElevenLabs request failed', { error: raw.error, status: raw.status })
    await speakNative(text)
    return
  }

  const bytes = decodeBase64(raw.audioBase64)
  if (!bytes.byteLength) {
    console.error('[TTS] ElevenLabs: empty audio payload')
    await speakNative(text)
    return
  }

  console.log('[TTS] ElevenLabs audio received', { bytes: raw.bytes, mimeType: raw.mimeType })
  cleanupAudio()

  try {
    await playAudioBytes(bytes, raw.mimeType || 'audio/mpeg')
  } catch (playbackError) {
    console.warn('[TTS] Audio playback failed, falling back to native', playbackError)
    await speakNative(text)
  }

  cleanupAudio()
}

/**
 * Speak text using the active TTS provider from settings.
 * Manages voice phase state (idle → speaking → idle).
 */
export async function speak(text: string): Promise<void> {
  const { isMuted, setVoicePhase } = useVoiceStore.getState()
  if (isMuted || !text.trim()) return

  stopAudio()
  setVoicePhase('speaking')

  // Cinematic micro-delay before speech begins
  await new Promise((r) => setTimeout(r, 250))

  const { ttsProvider } = useSettingsStore.getState()
  console.log('[TTS] speaking with provider:', ttsProvider)

  try {
    if (ttsProvider === 'basic') {
      await speakNative(text)
    } else if (ttsProvider === 'elevenlabs') {
      await speakElevenLabs(text)
    } else {
      console.warn('[TTS] Unknown provider, falling back to native')
      await speakNative(text)
    }
  } catch (err) {
    console.error('[TTS] speak error:', err)
    try {
      cleanupAudio()
      await speakNative(text)
    } catch (fallbackErr) {
      console.error('[TTS] native fallback failed:', fallbackErr)
    }
  } finally {
    setVoicePhase('idle')
  }
}
