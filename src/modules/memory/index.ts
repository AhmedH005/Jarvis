/**
 * memory module
 *
 * Backend status: LIVE
 * Owned domain: recall, personal history, facts, prior conversations
 * Live tools: memory_search, memory_get, file writes to memory store
 *
 * Mirrors: jarvis-system/modules/memory/
 */

import { nanoid } from '@/lib/utils'
import type {
  ModuleId,
  ModuleState,
  ModuleResult,
  OrchestrationContext,
  MemorySnippet,
  Decision,
  Handoff,
} from '@/shared/types'

export const MODULE_ID: ModuleId = 'memory'

export const MODULE_STATE: ModuleState = {
  module:              'memory',
  status:              'live',
  ownedDomain:         ['recall', 'personal history', 'prior conversations', 'facts'],
  currentConstraints:  ['only reads what exists — does not invent memories'],
  blockedCapabilities: [],
  lastUpdated:         new Date().toISOString(),
  notes:               'memory_search and memory_get are live via OpenClaw',
}

export interface MemoryOutput {
  snippets:   MemorySnippet[]
  summary:    string
  confidence: 'low' | 'medium' | 'high'
}

/**
 * Process a memory retrieval request.
 * jarvis-prime calls this before routing if prior context might matter.
 *
 * Per backend policy (orchestrator/flows.md step 2):
 *   - Always check memory first if prior context matters
 *   - Return snippets to prime; never route to memory AND another module simultaneously
 */
export function buildMemoryQuery(ctx: OrchestrationContext): string {
  // Extract key nouns / intent from user message for memory_search call
  return ctx.userMessage.trim()
}

/**
 * Parse raw memory tool output into typed MemoryOutput.
 * Called by the OpenClaw adapter after memory_search / memory_get returns.
 */
export function parseMemoryOutput(raw: string): MemoryOutput {
  if (!raw || raw.trim() === '') {
    return { snippets: [], summary: 'No relevant memory found.', confidence: 'low' }
  }

  const snippets: MemorySnippet[] = [{
    key:       'memory_result',
    value:     raw,
    source:    'memory_search',
    relevance: 'medium',
  }]

  return {
    snippets,
    summary:    raw.slice(0, 200),
    confidence: 'medium',
  }
}

export function buildMemoryResult(output: MemoryOutput): ModuleResult<MemoryOutput> {
  const decisions: Decision[] = []
  const handoffs:  Handoff[]  = []

  if (output.snippets.length > 0) {
    decisions.push({
      decisionId:      nanoid(),
      timestamp:       new Date().toISOString(),
      owner:           MODULE_ID,
      summary:         `Retrieved ${output.snippets.length} memory snippet(s)`,
      accepted:        true,
      reason:          'Prior context found — surfacing to jarvis-prime for routing',
      sourceRefs:      output.snippets.map((s) => s.source),
      impactedDomains: ['recall'],
    })
  }

  return {
    moduleId:            MODULE_ID,
    success:             true,
    data:                output,
    blockedCapabilities: [],
    handoffs,
    decisions,
  }
}
