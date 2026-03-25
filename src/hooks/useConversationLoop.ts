import { useCallback } from 'react'
import { startListening, stopListening } from '@/services/speechInput'
import { speak } from '@/services/ttsService'
import { stopAudio } from '@/services/voiceService'
import { sendToLLM } from '@/services/llmService'
import { formatJarvisResponse } from '@/services/jarvisFormatter'
import { useVoiceStore } from '@/store/voice'

/**
 * Full voice conversation loop:
 *   user speaks → SpeechRecognition → LLM (Claude) → formatJarvisResponse → TTS
 *
 * LLM and TTS providers are fully decoupled and controlled via useSettingsStore.
 */
export function useConversationLoop() {
  const setVoicePhase = useVoiceStore((s) => s.setVoicePhase)

  const handleTranscript = useCallback(
    async (transcript: string) => {
      let fullResponse = ''

      await sendToLLM(transcript, (event) => {
        if (event.type === 'token') {
          fullResponse += event.payload
        }
        if (event.type === 'end') {
          const formatted = formatJarvisResponse(fullResponse)
          if (formatted) void speak(formatted)
        }
        if (event.type === 'error') {
          console.error('[Conversation] LLM error:', event.payload)
          setVoicePhase('idle')
        }
      })
    },
    [setVoicePhase]
  )

  const activateVoice = useCallback(() => {
    stopAudio()
    startListening(handleTranscript)
  }, [handleTranscript])

  const deactivateVoice = useCallback(() => {
    stopListening()
    stopAudio()
  }, [])

  return { activateVoice, deactivateVoice }
}
