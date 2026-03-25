/**
 * llmService — LLM provider routing.
 *
 * Reads llmProvider from settings and dispatches to:
 *   "claude" → Anthropic Claude API via Electron IPC (streaming)
 *
 * This service only produces text. It has zero knowledge of TTS or audio.
 * To add a new provider, add a branch below and a corresponding IPC handler
 * in electron/main.ts.
 */
import { useSettingsStore } from '@/store/settings'

export type LLMStreamEvent =
  | { type: 'token'; payload: string }
  | { type: 'end';   payload: string }
  | { type: 'error'; payload: string }

export type LLMEventCallback = (event: LLMStreamEvent) => void

/**
 * Send a user message to the active LLM provider.
 * Events are delivered via `onEvent` callback; resolves when the stream ends.
 */
export async function sendToLLM(
  message: string,
  onEvent: LLMEventCallback,
  history?: Array<{ role: string; content: string }>
): Promise<void> {
  const { llmProvider } = useSettingsStore.getState()

  if (llmProvider === 'claude') {
    await sendViaClaude(message, onEvent, history)
  } else {
    onEvent({ type: 'error', payload: `Unknown LLM provider: ${llmProvider}` })
  }
}

async function sendViaClaude(
  message: string,
  onEvent: LLMEventCallback,
  history?: Array<{ role: string; content: string }>
): Promise<void> {
  if (!window.jarvis?.llm) {
    onEvent({ type: 'error', payload: 'LLM bridge not available — is ANTHROPIC_API_KEY set?' })
    return
  }

  let settled = false

  const unsub = window.jarvis.llm.onStream((event) => {
    if (settled) return
    if (event.type === 'token') {
      onEvent({ type: 'token', payload: event.payload })
    } else if (event.type === 'end') {
      settled = true
      unsub()
      onEvent({ type: 'end', payload: '' })
    } else if (event.type === 'error') {
      settled = true
      unsub()
      onEvent({ type: 'error', payload: event.payload })
    }
  })

  try {
    await window.jarvis.llm.send(message, history)
  } catch (err) {
    if (!settled) {
      settled = true
      unsub()
      onEvent({ type: 'error', payload: err instanceof Error ? err.message : String(err) })
    }
  }
}
