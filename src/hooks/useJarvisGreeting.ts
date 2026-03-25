import { useEffect, useRef } from 'react'
import { useUIState } from '@/store/uiState'
import { speak } from '@/services/ttsService'
import { getGreeting } from '@/services/jarvisFormatter'

/**
 * Speaks the time-appropriate Jarvis greeting once when mode transitions to 'active'.
 * Resets so the greeting fires again if the app is re-activated.
 */
export function useJarvisGreeting(): void {
  const mode = useUIState((s) => s.mode)
  const hasGreeted = useRef(false)

  useEffect(() => {
    console.log('[Greeting] mode changed to:', mode)
    if (mode === 'active' && !hasGreeted.current) {
      hasGreeted.current = true
      const greeting = getGreeting()
      console.log('[Greeting] triggering greeting:', greeting)
      void speak(greeting)
    }
    if (mode === 'idle' || mode === 'boot') {
      hasGreeted.current = false
    }
  }, [mode])
}
