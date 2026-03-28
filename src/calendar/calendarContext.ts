/**
 * Lightweight calendar session context.
 * Persists across the conversation turn so follow-up commands can reference
 * recent actions ("move that 30 min later", "also repeat next week").
 *
 * Intentionally simple — this is NOT a general memory system.
 * Auto-expires after SESSION_TTL_MS of inactivity.
 */

import type { CalendarEvent } from './calendarTypes'
import type { PlannedAction } from './calendarInterpreter'

export interface CalendarSession {
  /** Most recently created or modified events (for pronoun resolution: "that", "it") */
  lastEvents: CalendarEvent[]
  /** Action types applied in the last turn, in order */
  lastActionTypes: string[]
  /** Title patterns to exclude from bulk operations (e.g. "meeting" from "don't touch meetings") */
  excludePatterns: string[]
  /** Time-of-day constraint from last turn */
  onlyTimeRange?: 'morning' | 'afternoon' | 'evening'
  /** When this session was last updated (ms since epoch) */
  updatedAt: number
}

const SESSION_TTL_MS = 10 * 60 * 1000  // 10 minutes

let _session: CalendarSession | null = null

export function getSession(): CalendarSession | null {
  if (!_session) return null
  if (Date.now() - _session.updatedAt > SESSION_TTL_MS) {
    _session = null
    return null
  }
  return _session
}

export function patchSession(patch: Partial<Omit<CalendarSession, 'updatedAt'>>): void {
  _session = {
    lastEvents:      patch.lastEvents      ?? _session?.lastEvents      ?? [],
    lastActionTypes: patch.lastActionTypes ?? _session?.lastActionTypes ?? [],
    excludePatterns: patch.excludePatterns ?? _session?.excludePatterns ?? [],
    onlyTimeRange:   patch.onlyTimeRange   ?? _session?.onlyTimeRange,
    updatedAt: Date.now(),
  }
}

export function clearSession(): void {
  _session = null
}

// ── Pending plan (preview + confirm/cancel flow) ───────────────────────────────

export interface PendingPlan {
  actions: PlannedAction[]
  originalInput: string
  previewText: string
  createdAt: number
}

const PENDING_TTL_MS = 5 * 60 * 1000  // 5 minutes

let _pendingPlan: PendingPlan | null = null

export function setPendingPlan(plan: PendingPlan): void {
  _pendingPlan = plan
}

export function getPendingPlan(): PendingPlan | null {
  if (!_pendingPlan) return null
  if (Date.now() - _pendingPlan.createdAt > PENDING_TTL_MS) {
    _pendingPlan = null
    return null
  }
  return _pendingPlan
}

export function clearPendingPlan(): void {
  _pendingPlan = null
}
