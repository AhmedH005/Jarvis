/**
 * Flow: system → prime
 *
 * Mirrors: examples/system-to-prime-flow.md
 *
 * Scenario: User asks about gateway/session/system health.
 * System module reads session_status (non-mutating); returns summary to prime.
 * jarvis-prime formulates a clear answer from the diagnostic output.
 */

import { parseSystemOutput, buildSystemResult } from '@/modules/system'
import { decisionLog } from '@/core/orchestrator/decision-log'
import type { OrchestrationContext } from '@/shared/types'

export interface SystemToPrimeResult {
  gatewayOnline:   boolean
  diagnosticNotes: string
  primeSummary:    string  // formatted string prime can include in its answer
}

/**
 * `rawSystemOutput` is the string returned by session_status tool call.
 * Provided by the OpenClaw adapter after calling the tool.
 */
export function runSystemToPrimeFlow(
  ctx: OrchestrationContext,
  rawSystemOutput: string,
): SystemToPrimeResult {
  const sysOut = parseSystemOutput(rawSystemOutput)
  const sysRes = buildSystemResult(sysOut)
  decisionLog.appendMany(sysRes.decisions)

  const primeSummary = [
    `Gateway: ${sysOut.gatewayOnline ? 'ONLINE' : 'OFFLINE'}`,
    sysOut.activeSessionIds.length > 0
      ? `Active sessions: ${sysOut.activeSessionIds.join(', ')}`
      : 'No active sessions',
    sysOut.diagnosticNotes ? `Diagnostics: ${sysOut.diagnosticNotes}` : '',
  ].filter(Boolean).join('\n')

  return {
    gatewayOnline:   sysOut.gatewayOnline,
    diagnosticNotes: sysOut.diagnosticNotes,
    primeSummary,
  }
}

/** Build diagnostic prompt for jarvis-prime */
export function buildSystemPrompt(
  userMessage: string,
  primeSummary: string,
): string {
  return `[SYSTEM DIAGNOSTIC]\n${primeSummary}\n\nUser question: ${userMessage}`
}
