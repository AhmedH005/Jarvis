/**
 * Action capability model — maps each ActionChip instance to its truthful
 * execution category so the UI can communicate exactly what will happen.
 *
 *   'real'        — clicking directly triggers a concrete action (API call,
 *                   store mutation) with a real-time outcome.
 *   'navigational'— clicking navigates to the surface where the action lives;
 *                   the user completes it there. No direct side-effects.
 *   'blocked'     — the action cannot currently be performed and navigation
 *                   would not help (bridge absent, pipeline precondition unmet).
 */
export type ActionCapability = 'real' | 'navigational' | 'blocked'

// ── Bridge availability ────────────────────────────────────────────────────────

export interface SystemCapabilities {
  hasExecutionBridge:  boolean
  hasRequestBridge:    boolean
  hasCheckerBridge:    boolean
}

export function resolveSystemCapabilities(): SystemCapabilities {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = typeof window !== 'undefined' ? (window as any).jarvis : undefined
  return {
    hasExecutionBridge:  !!w?.builderExecution,
    hasRequestBridge:    !!w?.builderExecutionRequest,
    hasCheckerBridge:    !!w?.checker,
  }
}

// ── Per-kind chip capability mappings ─────────────────────────────────────────
// All current ActionChip instances are navigational: they open the agent panel
// where the user then performs the real action. Nothing is directly invoked.
// 'blocked' is reserved for cases where even navigation cannot help.

export const QUEUE_KIND_CAPABILITY: Record<string, ActionCapability> = {
  'in-progress':           'navigational',
  'awaiting-approval':     'navigational',
  'approved-ready':        'navigational',
  'remediation-pending':   'navigational',
  'needs-remediation':     'navigational',
  'awaiting-verification': 'navigational',
}

export const ACTIVITY_KIND_CAPABILITY: Record<string, ActionCapability> = {
  'mission-handoff':    'navigational',
  'request-created':    'navigational',
  'request-approved':   'navigational',
  'run-started':        'navigational',
  'run-finalized':      'navigational',
  'remediation-created':'navigational',
}

// ── Feedback text helpers ──────────────────────────────────────────────────────

/** Returns the brief feedback note shown inline after clicking an action chip. */
export function deriveChipFeedback(
  capability: ActionCapability,
  label: string,
  agentName?: string,
): string {
  if (capability === 'blocked') return 'Unavailable right now.'
  if (agentName) return `Opening ${agentName}…`
  // Strip common prefixes/suffixes to produce a terse note
  const base = label.replace(/^(OPEN|VIEW|START|GO TO)\s+/i, '').toLowerCase()
  return `Opening ${base}…`
}
