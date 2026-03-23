/**
 * health module
 *
 * Backend status: LIVE (planning only)
 * Owned domain: body plan, training schedule, sleep, recovery
 * Live capability: planning and intent generation
 * Blocked: no wearable integration, no Apple Health permissions
 *
 * Per backend policy:
 *   - health produces ScheduleBlocks and hands them to calendar
 *   - health does NOT place events directly (calendar is defined-only)
 *   - health does NOT write to execution without approval
 *
 * Mirrors: jarvis-system/modules/health/
 */

import { nanoid } from '@/lib/utils'
import type {
  ModuleId,
  ModuleState,
  ModuleResult,
  OrchestrationContext,
  Handoff,
  Decision,
  ScheduleBlock,
} from '@/shared/types'

export const MODULE_ID: ModuleId = 'health'

export const MODULE_STATE: ModuleState = {
  module:              'health',
  status:              'live',
  ownedDomain:         ['body plan', 'training schedule', 'sleep', 'recovery', 'nutrition intent'],
  currentConstraints:  [
    'planning only — no live wearable data',
    'no Apple Health permissions',
    'schedule placement requires calendar handoff',
  ],
  blockedCapabilities: ['wearable_sync', 'apple_health_read', 'live_hrv'],
  lastUpdated:         new Date().toISOString(),
  notes:               'Produces training/recovery blocks; hands off to calendar for placement',
}

export interface HealthPlan {
  sessionTypes:    string[]   // e.g. ['strength', 'mobility', 'cardio']
  scheduleBlocks:  ScheduleBlock[]
  notes:           string
  constraints:     string[]
}

export function buildHealthPlan(ctx: OrchestrationContext): HealthPlan {
  const worldHealth = ctx.worldState.healthPlan

  const sessionTypes = worldHealth.activeSessions.length > 0
    ? worldHealth.activeSessions
    : ['general fitness']

  const blocks: ScheduleBlock[] = sessionTypes.map((session) => ({
    label:       session,
    duration:    '45 minutes',
    preferredAt: 'morning',
    source:      MODULE_ID,
    energyCost:  session.includes('strength') ? 'high' : 'medium',
    constraints: {
      timeBudget:   '45 minutes',
      energyCost:   session.includes('strength') ? 'high' : 'medium',
      stressImpact: 'low',
    },
  }))

  return {
    sessionTypes,
    scheduleBlocks: blocks,
    notes:          worldHealth.currentFocus || 'No active focus set',
    constraints:    worldHealth.constraints,
  }
}

/** Build handoff to calendar for schedule placement */
export function buildCalendarHandoff(plan: HealthPlan): Handoff {
  return {
    handoffId:         nanoid(),
    fromModule:        MODULE_ID,
    toModule:          'calendar',
    intent:            'Place health session blocks in schedule',
    summary:           `Health requests ${plan.scheduleBlocks.length} block(s): ${plan.sessionTypes.join(', ')}`,
    requestedAction:   'Place or suggest schedule blocks for the following sessions',
    constraints: {
      energyCost:   'high',
      stressImpact: 'low',
      blockers:     ['calendar is defined-only — cannot auto-place'],
    },
    priority:          'normal',
    confidence:        'high',
    sourceRefs:        ['modules/health/state.md'],
    needsUserApproval: false,
    notes:             'Calendar will present suggestions; user confirms placement',
    status:            'pending',
    createdAt:         new Date().toISOString(),
  }
}

export function buildHealthResult(plan: HealthPlan): ModuleResult<HealthPlan> {
  const handoffs: Handoff[] = plan.scheduleBlocks.length > 0
    ? [buildCalendarHandoff(plan)]
    : []

  const decisions: Decision[] = [{
    decisionId:      nanoid(),
    timestamp:       new Date().toISOString(),
    owner:           MODULE_ID,
    summary:         `Health plan produced: ${plan.sessionTypes.join(', ')}`,
    accepted:        true,
    reason:          'Planning-only output; requires calendar handoff for placement',
    sourceRefs:      ['modules/health/state.md'],
    impactedDomains: ['body plan', 'training schedule'],
    followUp:        handoffs.length > 0 ? 'Calendar handoff pending' : undefined,
  }]

  return {
    moduleId:            MODULE_ID,
    success:             true,
    data:                plan,
    blockedCapabilities: MODULE_STATE.blockedCapabilities,
    handoffs,
    decisions,
  }
}
