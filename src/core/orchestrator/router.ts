/**
 * Orchestrator Router — mirrors orchestrator/router.md
 *
 * Heuristic: given a user message + world state, decide which module(s) to invoke.
 *
 * Rules (from backend router.md):
 *   1. Direct answer — if no module work needed (conversational / knowledge-only)
 *   2. Memory first — if prior context might matter
 *   3. Research — if external info + search available (currently blocked)
 *   4. System — if diagnostics / gateway / session info requested
 *   5. Health — if body / training / sleep / recovery planning
 *   6. Mental — if stress / mood / overload / reflection
 *   7. Calendar — if schedule placement (defined-only; always via handoff from health/mental)
 *   8. Execution — ONLY for approved mutations; jarvis-prime is sole router
 */

import type { ModuleId, RouteDecision, WorldState } from '@/shared/types'

// ── Signal maps ────────────────────────────────────────────────────────────────

const MEMORY_SIGNALS    = ['remember', 'recall', 'last time', 'before', 'you said', 'earlier', 'history']
const SYSTEM_SIGNALS    = ['gateway', 'session', 'status', 'health check', 'online', 'offline', 'process', 'diagnostic']
const HEALTH_SIGNALS    = ['workout', 'training', 'exercise', 'sleep', 'recovery', 'cardio', 'strength', 'mobility', 'nutrition', 'calories', 'rest day']
const MENTAL_SIGNALS    = ['stressed', 'overwhelmed', 'anxious', 'burnout', 'tired', 'exhausted', 'overloaded', 'mood', 'feeling', 'reflect', 'drained', 'mental']
const CALENDAR_SIGNALS  = ['schedule', 'calendar', 'plan my week', 'block time', 'when should i', 'find time', 'reschedule']
const RESEARCH_SIGNALS  = ['search', 'look up', 'find', 'what is', 'who is', 'latest', 'news', 'article', 'paper']
const EXECUTION_SIGNALS = ['create file', 'write file', 'edit file', 'run command', 'execute', 'delete', 'mkdir', 'move file']

function matchesAny(msg: string, signals: string[]): boolean {
  const lower = msg.toLowerCase()
  return signals.some((s) => lower.includes(s))
}

// ── Router ─────────────────────────────────────────────────────────────────────

export function route(userMessage: string, worldState: WorldState): RouteDecision {
  const secondaries: ModuleId[] = []

  // 1. Memory — check first if context might matter
  const needsMemory = matchesAny(userMessage, MEMORY_SIGNALS)
  if (needsMemory) secondaries.push('memory')

  // 2. Execution — flag immediately; requires approval
  if (matchesAny(userMessage, EXECUTION_SIGNALS)) {
    return {
      primary:          'execution',
      secondaries:      needsMemory ? ['memory'] : [],
      reason:           'Mutation request detected — execution module with approval gate',
      requiresApproval: true,
    }
  }

  // 3. System diagnostics
  if (matchesAny(userMessage, SYSTEM_SIGNALS)) {
    return {
      primary:          'system',
      secondaries,
      reason:           'System/gateway diagnostic request',
      requiresApproval: false,
    }
  }

  // 4. Health planning
  if (matchesAny(userMessage, HEALTH_SIGNALS)) {
    // Health may cascade to calendar
    if (!secondaries.includes('calendar')) secondaries.push('calendar')
    return {
      primary:          'health',
      secondaries,
      reason:           'Health/training planning request; calendar will receive handoff',
      requiresApproval: false,
    }
  }

  // 5. Mental / overload
  if (matchesAny(userMessage, MENTAL_SIGNALS) || worldState.mentalState.overloadFlag) {
    if (!secondaries.includes('calendar')) secondaries.push('calendar')
    return {
      primary:          'mental',
      secondaries,
      reason:           'Mental/stress signal detected; schedule softening may be recommended',
      requiresApproval: false,
    }
  }

  // 6. Calendar — direct schedule intent (rare; usually comes via health/mental handoff)
  if (matchesAny(userMessage, CALENDAR_SIGNALS)) {
    return {
      primary:          'calendar',
      secondaries,
      reason:           'Direct calendar/schedule request',
      requiresApproval: false,
    }
  }

  // 7. Research — blocked, but route with explanation
  if (matchesAny(userMessage, RESEARCH_SIGNALS)) {
    return {
      primary:          'research',
      secondaries,
      reason:           'Research/search request — module is currently blocked (no Brave API)',
      requiresApproval: false,
    }
  }

  // 8. Memory context available — check it first then answer directly
  if (needsMemory) {
    return {
      primary:          'memory',
      secondaries:      [],
      reason:           'Prior context recall requested',
      requiresApproval: false,
    }
  }

  // Default: direct answer from jarvis-prime
  return {
    primary:          'direct',
    secondaries:      [],
    reason:           'Conversational or knowledge-only request — no module delegation needed',
    requiresApproval: false,
  }
}
