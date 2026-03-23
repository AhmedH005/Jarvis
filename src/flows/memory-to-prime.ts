/**
 * Flow: memory → prime
 *
 * Mirrors: examples/memory-to-prime-flow.md
 *
 * Scenario: User asks something that might have been discussed before.
 * Memory retrieves relevant snippets; jarvis-prime uses them as context
 * before answering or routing further.
 */

import {
  buildMemoryQuery,
  parseMemoryOutput,
  buildMemoryResult,
} from '@/modules/memory'
import { decisionLog } from '@/core/orchestrator/decision-log'
import { worldState } from '@/shared/world-state'
import type { OrchestrationContext, MemorySnippet } from '@/shared/types'

export interface MemoryToPrimeResult {
  snippets:         MemorySnippet[]
  contextSummary:   string
  primeContextNote: string   // injected into prime's prompt as system note
}

/**
 * Execute the memory pre-fetch and return context for jarvis-prime to use.
 * `rawMemoryOutput` is the string returned from the memory_search tool call
 * (provided by the OpenClaw adapter).
 */
export function runMemoryToPrimeFlow(
  ctx: OrchestrationContext,
  rawMemoryOutput: string,
): MemoryToPrimeResult {
  const query    = buildMemoryQuery(ctx)
  const memOut   = parseMemoryOutput(rawMemoryOutput)
  const memRes   = buildMemoryResult(memOut)

  decisionLog.appendMany(memRes.decisions)

  // Inject into world state for prime to read
  worldState.update({
    memoryContext: { recentSnippets: memOut.snippets },
  })

  const primeContextNote = memOut.snippets.length > 0
    ? `[MEMORY CONTEXT: ${memOut.summary}]`
    : '[MEMORY CONTEXT: No relevant prior context found]'

  return {
    snippets:         memOut.snippets,
    contextSummary:   memOut.summary,
    primeContextNote,
  }
}

/** Build enriched prompt for jarvis-prime that includes memory context */
export function buildMemoryEnrichedPrompt(
  userMessage: string,
  primeContextNote: string,
): string {
  return `${primeContextNote}\n\nUser: ${userMessage}`
}
