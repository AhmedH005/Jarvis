/**
 * Flow: health → calendar
 *
 * Mirrors: examples/health-to-calendar-flow.md
 *
 * Scenario: User asks about their training plan. Health module produces
 * session blocks (strength + mobility), hands off to calendar for placement.
 * Calendar is defined-only — presents suggestions only.
 */

import { buildHealthPlan, buildHealthResult } from '@/modules/health'
import { buildCalendarSuggestion, buildCalendarResult } from '@/modules/calendar'
import { handoffBus } from '@/shared/handoff-bus'
import { decisionLog } from '@/core/orchestrator/decision-log'
import type { OrchestrationContext } from '@/shared/types'

export async function runHealthToCalendarFlow(ctx: OrchestrationContext): Promise<{
  summary:    string
  suggestion: string
  caveat:     string
}> {
  // 1. Health module produces plan
  const plan    = buildHealthPlan(ctx)
  const healRes = buildHealthResult(plan)
  decisionLog.appendMany(healRes.decisions)

  // 2. Extract calendar handoffs
  const calHandoffs = healRes.handoffs.filter((h) => h.toModule === 'calendar')

  if (calHandoffs.length === 0) {
    return {
      summary:    `Health plan: ${plan.notes}`,
      suggestion: 'No schedule blocks to place.',
      caveat:     '',
    }
  }

  // 3. Dispatch via bus; calendar processes
  handoffBus.dispatch(calHandoffs)

  const suggestion = buildCalendarSuggestion(calHandoffs)
  const calRes     = buildCalendarResult(suggestion, calHandoffs)
  decisionLog.appendMany(calRes.decisions)

  calHandoffs.forEach((h) => handoffBus.markCompleted(h.handoffId))

  return {
    summary:    `Health plan: ${plan.notes}. Sessions: ${plan.sessionTypes.join(', ')}`,
    suggestion: suggestion.presentation,
    caveat:     suggestion.caveat,
  }
}
