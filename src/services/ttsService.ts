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
import { getSpeechProvider } from '@/integrations/registry/providerRegistry'
import { stopAudio } from './voiceService'

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

  try {
    const result = await getSpeechProvider().speak(text)
    if (!result.ok) {
      console.error('[TTS] speak unavailable:', result.failure?.message ?? result.summary)
    }
  } catch (err) {
    console.error('[TTS] speak error:', err)
  } finally {
    setVoicePhase('idle')
  }
}
