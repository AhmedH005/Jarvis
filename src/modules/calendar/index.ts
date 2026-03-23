/**
 * calendar module
 *
 * Backend status: DEFINED-ONLY
 * Reason: No live Apple Calendar / CalDAV integration; no permissions granted
 * Owned domain: schedule state, time placement, commitment tracking
 *
 * Per backend policy:
 *   - calendar CANNOT read or write Apple Calendar
 *   - calendar receives handoffs from health + mental and presents suggestions
 *   - calendar does NOT auto-place — user must confirm
 *   - calendar tracks pending blocks as "schedule intent"
 *
 * Mirrors: jarvis-system/modules/calendar/
 */

import { nanoid } from '@/lib/utils'
import type {
  ModuleId,
  ModuleState,
  ModuleResult,
  Handoff,
  Decision,
  ScheduleBlock,
} from '@/shared/types'

export const MODULE_ID: ModuleId = 'calendar'

export const MODULE_STATE: ModuleState = {
  module:              'calendar',
  status:              'defined-only',
  ownedDomain:         ['schedule state', 'time placement', 'commitment tracking'],
  currentConstraints:  [
    'no Apple Calendar integration',
    'no CalDAV permissions',
    'cannot read or write live schedule',
    'suggestion-only output',
  ],
  blockedCapabilities: [
    'apple_calendar_read',
    'apple_calendar_write',
    'caldav_sync',
    'event_create',
    'event_delete',
  ],
  lastUpdated:         new Date().toISOString(),
  notes:               'Receives schedule intent from health/mental; presents suggestions only',
}

export interface CalendarSuggestion {
  blocks:       ScheduleBlock[]
  presentation: string   // human-readable suggestion text
  caveat:       string   // reminder that this is suggestion only
}

export function buildCalendarSuggestion(
  inboundHandoffs: Handoff[],
): CalendarSuggestion {
  const blocks: ScheduleBlock[] = inboundHandoffs.flatMap((h) => {
    // Extract schedule blocks from handoff constraints/notes if available
    // In production this would parse the structured handoff data
    return [{
      label:       h.intent,
      duration:    h.constraints.timeBudget ?? '30 minutes',
      preferredAt: 'flexible',
      source:      h.fromModule,
      energyCost:  h.constraints.energyCost ?? 'medium',
      constraints: h.constraints,
    }]
  })

  const blockLines = blocks.map((b) =>
    `• ${b.label} — ${b.duration} (${b.preferredAt}, energy: ${b.energyCost})`
  ).join('\n')

  const presentation = blocks.length > 0
    ? `Schedule suggestions from ${[...new Set(inboundHandoffs.map((h) => h.fromModule))].join(', ')}:\n${blockLines}`
    : 'No schedule adjustments requested at this time.'

  return {
    blocks,
    presentation,
    caveat: 'These are suggestions only. Apple Calendar integration is not active — confirm placement manually.',
  }
}

export function buildCalendarResult(
  suggestion: CalendarSuggestion,
  inboundHandoffs: Handoff[],
): ModuleResult<CalendarSuggestion> {
  const decisions: Decision[] = [{
    decisionId:      nanoid(),
    timestamp:       new Date().toISOString(),
    owner:           MODULE_ID,
    summary:         `Calendar: ${suggestion.blocks.length} block suggestion(s) prepared`,
    accepted:        true,
    reason:          'Defined-only module — presenting suggestions, no auto-placement',
    sourceRefs:      inboundHandoffs.map((h) => h.handoffId),
    impactedDomains: ['schedule state'],
    followUp:        'User must confirm placement manually',
  }]

  return {
    moduleId:            MODULE_ID,
    success:             true,
    data:                suggestion,
    blockedCapabilities: MODULE_STATE.blockedCapabilities,
    handoffs:            [],   // calendar does not produce outbound handoffs
    decisions,
  }
}
