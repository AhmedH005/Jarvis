/**
 * Lightweight feedback signals for memory relevance.
 * markUseful / markIrrelevant stage boost/penalty values to feedback.json.
 * All reads are live; all writes are staged under DRY_RUN.
 */

import { readSafeJson } from '@/integrations/runtime/files'
import { stageAction } from '@/integrations/runtime/safety'

export interface FeedbackEntry {
  boost:    number
  markedAt: string
}

export type FeedbackStore = Record<string, FeedbackEntry>

const FEEDBACK_PATH = 'memory/feedback.json'
const BOOST_VALUE   =  0.15
const PENALTY_VALUE = -0.20

// ── Read ──────────────────────────────────────────────────────────────────────

export async function loadFeedbackStore(): Promise<FeedbackStore> {
  try {
    const data = await readSafeJson<FeedbackStore>(FEEDBACK_PATH, {})
    return data ?? {}
  } catch {
    return {}
  }
}

export async function getFeedbackBoost(recordId: string): Promise<number> {
  const store = await loadFeedbackStore()
  return store[recordId]?.boost ?? 0
}

// ── Write (staged) ────────────────────────────────────────────────────────────

async function stageFeedback(
  recordId: string,
  boost: number,
  action: 'markUseful' | 'markIrrelevant',
): Promise<void> {
  stageAction({
    domain:      'memory',
    providerKey: 'memory-feedback',
    title:       `Memory feedback: ${action}`,
    summary:     `${action} — record ${recordId} (boost ${boost >= 0 ? '+' : ''}${boost})`,
    payload:     { recordId, boost, markedAt: new Date().toISOString() },
  })
}

export async function markUseful(recordId: string): Promise<void> {
  await stageFeedback(recordId, BOOST_VALUE, 'markUseful')
}

export async function markIrrelevant(recordId: string): Promise<void> {
  await stageFeedback(recordId, PENALTY_VALUE, 'markIrrelevant')
}
