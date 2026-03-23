/**
 * Orchestrator policies — mirrors orchestrator/policies.md + escalation-rules.md
 *
 * Hard rules jarvis-prime enforces regardless of routing:
 *   - Domain ownership: each module owns its domain; no cross-domain writes
 *   - Approval gate: mutations always require ApprovalRequest
 *   - Conflict resolution: when multiple modules disagree, jarvis-prime arbitrates
 *   - Calendar immunity: calendar suggestions are never auto-applied
 *   - Research honesty: blocked modules must declare blocked state
 */

import type { ModuleId, Handoff, ModuleResult } from '@/shared/types'

// ── Domain ownership map — from backend world-state.md ────────────────────────

export const DOMAIN_OWNERS: Record<string, ModuleId> = {
  'recall':               'memory',
  'personal history':     'memory',
  'prior conversations':  'memory',
  'facts':                'memory',

  'gateway health':       'system',
  'session diagnostics':  'system',
  'process inspection':   'system',

  'external information': 'research',
  'web search':           'research',
  'factual lookups':      'research',

  'body plan':            'health',
  'training schedule':    'health',
  'sleep':                'health',
  'recovery':             'health',
  'nutrition intent':     'health',

  'stress':               'mental',
  'mood':                 'mental',
  'overload detection':   'mental',
  'reflection':           'mental',
  'cognitive load':       'mental',

  'schedule state':       'calendar',
  'time placement':       'calendar',
  'commitment tracking':  'calendar',

  'file mutations':       'execution',
  'shell commands':       'execution',
  'write operations':     'execution',
  'approved changes':     'execution',
}

// ── Policy checks ──────────────────────────────────────────────────────────────

/** Returns true if fromModule is allowed to request an action in toDomain */
export function canRequestDomain(fromModule: ModuleId, toDomain: string): boolean {
  const owner = DOMAIN_OWNERS[toDomain]
  if (!owner) return true  // unknown domain — allow, log separately
  if (owner === fromModule) return true  // owns domain — always allowed

  // Approved cross-domain patterns (from backend policies):
  //   health → calendar (schedule placement requests)
  //   mental → calendar (schedule softening requests)
  //   * → memory (read-only context fetch)
  //   jarvis-prime → execution (sole router)
  const ALLOWED_CROSS: Array<[ModuleId, ModuleId]> = [
    ['health',       'calendar'],
    ['mental',       'calendar'],
    ['jarvis-prime', 'execution'],
  ]

  return ALLOWED_CROSS.some(([from, to]) => {
    const toOwner = DOMAIN_OWNERS[toDomain]
    return from === fromModule && to === toOwner
  })
}

/** Validate a handoff against domain ownership policy */
export function validateHandoff(handoff: Handoff): { valid: boolean; reason?: string } {
  const toOwner = DOMAIN_OWNERS[handoff.intent] ?? handoff.toModule

  if (handoff.toModule === 'execution' && handoff.fromModule !== 'jarvis-prime') {
    return {
      valid:  false,
      reason: `Policy violation: only jarvis-prime may route to execution. Got: ${handoff.fromModule}`,
    }
  }

  if (!canRequestDomain(handoff.fromModule, handoff.toModule as string)) {
    return {
      valid:  false,
      reason: `Policy violation: ${handoff.fromModule} cannot request domain owned by ${toOwner}`,
    }
  }

  return { valid: true }
}

/** Returns true if a result from a blocked module should halt further routing */
export function isHardBlock(result: ModuleResult): boolean {
  return !result.success && result.blockedCapabilities.length > 0
}

/** Escalation rules — mirrors escalation-rules.md */
export const ESCALATION_RULES = {
  /**
   * If calendar is defined-only and health/mental both request schedule placement,
   * jarvis-prime should present both as a combined suggestion rather than separate messages.
   */
  mergeCalendarHandoffs: true,

  /**
   * If execution is requested without approval, jarvis-prime must gate it and
   * prompt the user for confirmation before proceeding.
   */
  alwaysApproveExecution: true,

  /**
   * If research is blocked, jarvis-prime should answer from training knowledge
   * and transparently note the limitation rather than failing the request.
   */
  gracefulResearchFallback: true,

  /**
   * Memory context should be pre-fetched when memory signals are detected,
   * even if the primary module is something else.
   */
  prefetchMemoryContext: true,
}
