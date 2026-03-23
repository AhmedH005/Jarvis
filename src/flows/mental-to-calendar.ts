/**
 * Flow: mental → calendar
 *
 * Mirrors: examples/mental-to-calendar-flow.md
 *
 * Scenario: User expresses stress or overwhelm. Mental module detects overload,
 * recommends schedule softening, hands off to calendar for buffer block placement.
 * Calendar presents suggestions — never auto-applies.
 */

import { assessMentalState, buildMentalResult } from '@/modules/mental'
import { buildCalendarSuggestion, buildCalendarResult } from '@/modules/calendar'
import { handoffBus } from '@/shared/handoff-bus'
import { decisionLog } from '@/core/orchestrator/decision-log'
import { worldState } from '@/shared/world-state'
import type { OrchestrationContext } from '@/shared/types'

export async function runMentalToCalendarFlow(ctx: OrchestrationContext): Promise<{
  assessment:  string
  suggestion:  string
  caveat:      string
  modeChange?: string
}> {
  // 1. Mental module assesses state
  const assessment = assessMentalState(ctx)
  const mentalRes  = buildMentalResult(assessment)
  decisionLog.appendMany(mentalRes.decisions)

  // 2. Update world state
  worldState.update({
    mentalState: {
      overloadFlag: assessment.overloadDetected,
      bufferNeeded: assessment.bufferNeeded,
      currentMode:  assessment.currentMode,
      notes:        assessment.recommendation,
    },
  })

  const modeChange = assessment.overloadDetected
    ? `Mode updated: normal → ${assessment.currentMode}`
    : undefined

  // 3. Calendar handoff (if buffer needed)
  const calHandoffs = mentalRes.handoffs.filter((h) => h.toModule === 'calendar')

  if (calHandoffs.length === 0) {
    return {
      assessment: assessment.recommendation,
      suggestion: 'No schedule adjustments needed.',
      caveat:     '',
      modeChange,
    }
  }

  handoffBus.dispatch(calHandoffs)

  const suggestion = buildCalendarSuggestion(calHandoffs)
  const calRes     = buildCalendarResult(suggestion, calHandoffs)
  decisionLog.appendMany(calRes.decisions)

  calHandoffs.forEach((h) => handoffBus.markCompleted(h.handoffId))

  return {
    assessment: assessment.recommendation,
    suggestion: suggestion.presentation,
    caveat:     suggestion.caveat,
    modeChange,
  }
}
