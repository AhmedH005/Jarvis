/**
 * mental module
 *
 * Backend status: LIVE (planning only)
 * Owned domain: stress/mood interpretation, overload detection, reflection
 * Live capability: overload detection, schedule softening recommendations
 *
 * Per backend policy:
 *   - mental INFLUENCES but NEVER OVERWRITES calendar
 *   - mental recommends buffer blocks via handoff to calendar
 *   - mental sets overloadFlag in world state when detected
 *
 * Mirrors: jarvis-system/modules/mental/
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

export const MODULE_ID: ModuleId = 'mental'

export const MODULE_STATE: ModuleState = {
  module:              'mental',
  status:              'live',
  ownedDomain:         ['stress', 'mood', 'overload detection', 'reflection', 'cognitive load'],
  currentConstraints:  [
    'planning only — interprets but does not override calendar',
    'no biometric data access',
  ],
  blockedCapabilities: ['biometric_read', 'wearable_hrv'],
  lastUpdated:         new Date().toISOString(),
  notes:               'Detects overload from user language; recommends softening via calendar handoff',
}

export interface MentalAssessment {
  overloadDetected: boolean
  bufferNeeded:     boolean
  currentMode:      'normal' | 'deep-work' | 'recovery' | 'reactive'
  recommendation:   string
  bufferBlocks:     ScheduleBlock[]
}

const OVERLOAD_SIGNALS = [
  'overwhelmed', 'stressed', 'too much', 'burnout', 'exhausted',
  'can\'t focus', 'anxious', 'overloaded', 'tired', 'drained',
]

export function assessMentalState(ctx: OrchestrationContext): MentalAssessment {
  const msg = ctx.userMessage.toLowerCase()
  const worldMental = ctx.worldState.mentalState

  const overloadDetected =
    worldMental.overloadFlag ||
    OVERLOAD_SIGNALS.some((signal) => msg.includes(signal))

  const bufferNeeded = overloadDetected || worldMental.bufferNeeded

  let currentMode: MentalAssessment['currentMode'] = worldMental.currentMode
  if (overloadDetected) currentMode = 'recovery'

  const recommendation = overloadDetected
    ? 'Schedule buffer time and reduce cognitive load. Consider softening today\'s agenda.'
    : bufferNeeded
      ? 'Maintain current recovery pace. Avoid adding high-stress tasks.'
      : 'No overload detected. Proceed normally.'

  const bufferBlocks: ScheduleBlock[] = bufferNeeded ? [{
    label:       'buffer / decompression',
    duration:    '30 minutes',
    preferredAt: 'afternoon',
    source:      MODULE_ID,
    energyCost:  'low',
    constraints: {
      timeBudget:   '30 minutes',
      energyCost:   'low',
      stressImpact: 'low',
    },
  }] : []

  return { overloadDetected, bufferNeeded, currentMode, recommendation, bufferBlocks }
}

/** Build handoff to calendar for schedule softening */
export function buildCalendarHandoff(assessment: MentalAssessment): Handoff {
  return {
    handoffId:         nanoid(),
    fromModule:        MODULE_ID,
    toModule:          'calendar',
    intent:            'Soften schedule — insert buffer blocks for mental recovery',
    summary:           assessment.recommendation,
    requestedAction:   'Suggest buffer time slots; do not remove existing commitments',
    constraints: {
      energyCost:   'low',
      stressImpact: 'low',
      blockers:     ['calendar is defined-only — cannot auto-place'],
    },
    priority:          'high',
    confidence:        assessment.overloadDetected ? 'high' : 'medium',
    sourceRefs:        ['modules/mental/state.md'],
    needsUserApproval: false,
    notes:             'Mental influence only — user decides final schedule',
    status:            'pending',
    createdAt:         new Date().toISOString(),
  }
}

export function buildMentalResult(assessment: MentalAssessment): ModuleResult<MentalAssessment> {
  const handoffs: Handoff[] = assessment.bufferNeeded
    ? [buildCalendarHandoff(assessment)]
    : []

  const decisions: Decision[] = [{
    decisionId:      nanoid(),
    timestamp:       new Date().toISOString(),
    owner:           MODULE_ID,
    summary:         `Mental state: ${assessment.currentMode}${assessment.overloadDetected ? ' (overload detected)' : ''}`,
    accepted:        true,
    reason:          assessment.overloadDetected
      ? 'Overload signals detected in user message — recommending schedule softening'
      : 'No overload signals — no intervention needed',
    sourceRefs:      ['modules/mental/state.md'],
    impactedDomains: ['stress', 'mood', 'calendar influence'],
    followUp:        handoffs.length > 0 ? 'Calendar handoff pending for buffer placement' : undefined,
  }]

  return {
    moduleId:            MODULE_ID,
    success:             true,
    data:                assessment,
    blockedCapabilities: MODULE_STATE.blockedCapabilities,
    handoffs,
    decisions,
  }
}
