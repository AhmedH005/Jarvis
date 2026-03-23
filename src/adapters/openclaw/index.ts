/**
 * OpenClaw Adapter — Phase 5
 *
 * Bridges jarvis-prime orchestrator ↔ the OpenClaw gateway running in Electron main.
 * Provides the `OpenClawSend` function that jarvis-prime uses to delegate
 * tool calls and final answer generation to the real AI backend.
 *
 * This adapter:
 *   - Uses window.jarvis.openclaw.send() (Electron IPC) under the hood
 *   - Injects system notes and memory context via input-builder
 *   - Accumulates streaming tokens into a final string for orchestrator
 *   - Exposes runOrchestratedRequest() as the single entry point for the UI
 */

import { orchestrate } from '@/core/orchestrator/jarvis-prime'
import { buildInput } from './input-builder'
import type { OrchestrationContext, WorldState } from '@/shared/types'
import type { StreamEvent } from '@/types'

// ── OpenClaw send function ─────────────────────────────────────────────────────

/**
 * Wraps window.jarvis.openclaw.send() in a Promise that resolves to the
 * full accumulated text once the stream ends (or errors).
 *
 * Used as the `send` injection into jarvis-prime.orchestrate().
 */
export async function openclawSend(
  message:   string,
  ctx?:      OrchestrationContext,
  conversationId?: string,
  history?:  Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  if (!window.jarvis) {
    throw new Error('No Electron bridge — run inside the app')
  }

  // Inject system notes from orchestration context
  const { message: enriched } = ctx
    ? buildInput(message, ctx)
    : { message }

  return new Promise<string>((resolve, reject) => {
    let accumulated = ''
    let settled     = false

    const unsub = window.jarvis!.openclaw.onStream((event: StreamEvent) => {
      if (event.type === 'token') {
        accumulated += event.payload
      } else if (event.type === 'end') {
        if (!settled) { settled = true; unsub(); resolve(accumulated) }
      } else if (event.type === 'error') {
        if (!settled) { settled = true; unsub(); reject(new Error(event.payload)) }
      }
    })

    window.jarvis!.openclaw
      .send(enriched, conversationId, history ?? [])
      .catch((err: unknown) => {
        if (!settled) { settled = true; unsub(); reject(err) }
      })
  })
}

// ── Orchestrated request (streaming) ──────────────────────────────────────────

/**
 * Full orchestrated request with streaming output to UI.
 *
 * jarvis-prime routes internally, then the final answer is streamed back to
 * the renderer via the existing openclaw:stream IPC events.
 *
 * The UI (InputBar) continues to use window.jarvis.openclaw.send() for the
 * actual streaming — this entry point adds the orchestration layer on top.
 */
export async function runOrchestratedRequest(params: {
  userMessage:    string
  conversationId: string
  history:        Array<{ role: 'user' | 'assistant'; content: string }>
  worldState:     WorldState
}): Promise<{
  answer:        string
  moduleResults: import('@/shared/types').ModuleResult[]
  handoffs:      import('@/shared/types').Handoff[]
}> {
  const result = await orchestrate({
    userMessage:    params.userMessage,
    conversationId: params.conversationId,
    history:        params.history,
    send: (message, ctx) => openclawSend(
      message,
      ctx,
      params.conversationId,
      params.history,
    ),
  })

  return {
    answer:        result.answer,
    moduleResults: result.moduleResults,
    handoffs:      result.handoffsIssued,
  }
}
