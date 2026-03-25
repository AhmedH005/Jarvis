import { useVoiceStore } from '@/store/voice'
import { stopAudio } from './voiceService'

type TranscriptCallback = (transcript: string) => void

// Minimal duck-typed interfaces for Web Speech API (not in TS core lib)
interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
interface ISpeechRecognitionResult {
  0: { transcript: string }
}
interface ISpeechRecognitionEvent {
  results: ISpeechRecognitionResult[]
}
interface ISpeechRecognitionErrorEvent {
  error: string
}
interface ISpeechRecognitionCtor {
  new(): ISpeechRecognition
}

function getSpeechRecognition(): ISpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as ISpeechRecognitionCtor | null
}

let recognition: ISpeechRecognition | null = null

/** Start listening for a single utterance. Interrupts Jarvis speech if active. */
export function startListening(onResult: TranscriptCallback): void {
  const SR = getSpeechRecognition()
  if (!SR) {
    console.warn('[Voice] Web Speech API not available in this environment')
    return
  }

  // Interrupt Jarvis if currently speaking
  stopAudio()
  stopListening()

  recognition = new SR()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'en-US'
  recognition.maxAlternatives = 1

  const { setVoicePhase, setLastTranscript } = useVoiceStore.getState()
  setVoicePhase('listening')

  recognition.onresult = (event: ISpeechRecognitionEvent) => {
    const transcript = event.results[0]?.[0]?.transcript?.trim() ?? ''
    if (transcript) {
      setLastTranscript(transcript)
      setVoicePhase('idle')
      onResult(transcript)
    }
  }

  recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('[Voice] Speech recognition error:', event.error)
    }
    setVoicePhase('idle')
  }

  recognition.onend = () => {
    if (useVoiceStore.getState().voicePhase === 'listening') {
      setVoicePhase('idle')
    }
  }

  try {
    recognition.start()
  } catch (err) {
    console.warn('[Voice] Failed to start recognition:', err)
    setVoicePhase('idle')
  }
}

/** Stop any active speech recognition. */
export function stopListening(): void {
  if (recognition) {
    try { recognition.abort() } catch { /* ignore */ }
    recognition = null
  }
  if (useVoiceStore.getState().voicePhase === 'listening') {
    useVoiceStore.getState().setVoicePhase('idle')
  }
}
