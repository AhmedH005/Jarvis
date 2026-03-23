/**
 * Flow: research blocked → prime fallback
 *
 * Mirrors: examples/research-blocked-flow.md
 *
 * Scenario: User asks a question that would normally require web search.
 * Research module is blocked (no Brave API). jarvis-prime falls back to
 * training knowledge and transparently notes the limitation.
 */

import { buildResearchResult, BLOCKED_EXPLANATION } from '@/modules/research'
import { decisionLog } from '@/core/orchestrator/decision-log'
import type { OrchestrationContext, ModuleResult } from '@/shared/types'

export interface ResearchBlockedResult {
  blockedExplanation: string
  fallbackUsed:       boolean
  query:              string
  moduleResult:       ModuleResult
}

export function runResearchBlockedFlow(
  ctx: OrchestrationContext,
): ResearchBlockedResult {
  const resRes = buildResearchResult(ctx.userMessage)
  decisionLog.appendMany(resRes.decisions)

  return {
    blockedExplanation: BLOCKED_EXPLANATION,
    fallbackUsed:       true,
    query:              ctx.userMessage,
    moduleResult:       resRes,
  }
}

/**
 * Build the fallback prompt to send to jarvis-prime (via OpenClaw).
 * The adapter appends this to the system context so the model acknowledges
 * the limitation before answering.
 */
export function buildResearchFallbackPrompt(query: string): string {
  return (
    `[SYSTEM NOTE: Research module is unavailable. ${BLOCKED_EXPLANATION}]\n` +
    `Answer the following from training knowledge only, and note the limitation:\n${query}`
  )
}
