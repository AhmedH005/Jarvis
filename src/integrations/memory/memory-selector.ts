/**
 * Memory selection engine.
 * Given a SelectionContext, assembles working memory (short-term + long-term),
 * scores all candidates, and returns a ranked SelectionResult.
 */

import type {
  MemoryRecord,
  MemoryDomain,
  SelectionContext,
  SelectionResult,
  WorkingMemory,
  ScoredMemoryRecord,
} from '@/shared/memory-types'
import { loadPersistedRecords, sessionReceiptsAsRecords } from './memory-store'
import { scoreRecord, MODULE_DOMAIN_BIAS, DEFAULT_SCORING_WEIGHTS } from './memory-scoring'
import { getFeedbackBoost } from './feedback'

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 10

export function normalizeSelectionLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(Math.floor(limit as number), 50))
}

// ── Selection engine ──────────────────────────────────────────────────────────

/**
 * Select the most relevant memory records for the given context.
 *
 * - Short-term: in-session receipts (always included unless includeShortTerm=false)
 * - Long-term: persisted records from SAFE_ROOT
 * - Both pools are merged, deduplicated by id, then scored and ranked.
 */
export async function selectMemory(context: SelectionContext): Promise<SelectionResult> {
  const limit = normalizeSelectionLimit(context.limit)
  const includeShortTerm = context.includeShortTerm !== false

  // ── 1. Assemble working memory pools ──────────────────────────────────────

  const shortTerm: MemoryRecord[] = includeShortTerm ? sessionReceiptsAsRecords() : []
  const longTerm:  MemoryRecord[] = await loadPersistedRecords()

  // Deduplicate by id (session receipt may duplicate a persisted receipt)
  const seen   = new Set<string>()
  const candidates: MemoryRecord[] = []
  for (const record of [...shortTerm, ...longTerm]) {
    if (!seen.has(record.id)) {
      seen.add(record.id)
      candidates.push(record)
    }
  }

  // ── 2. Apply module domain bias (pre-filter) ───────────────────────────────
  // If no explicit domain filter, use module bias to narrow candidates
  const filteredCandidates = applyDomainFilter(candidates, context)

  // ── 3. Score all candidates ───────────────────────────────────────────────

  const scored: ScoredMemoryRecord[] = await Promise.all(
    filteredCandidates.map(async (record) => {
      const boost = await getFeedbackBoost(record.id)
      const score = scoreRecord(record, context, boost, DEFAULT_SCORING_WEIGHTS)
      return { record, score }
    }),
  )

  // ── 4. Sort by totalScore descending ─────────────────────────────────────

  scored.sort((left, right) => {
    if (right.score.totalScore !== left.score.totalScore) {
      return right.score.totalScore - left.score.totalScore
    }
    if (right.record.updatedAt !== left.record.updatedAt) {
      return right.record.updatedAt.localeCompare(left.record.updatedAt)
    }
    return left.record.id.localeCompare(right.record.id)
  })

  const selected = scored.slice(0, limit)
  const selectedRecords = selected.map((s) => s.record)

  // ── 5. Build working memory snapshot ─────────────────────────────────────

  const workingMemory: WorkingMemory = {
    shortTerm,
    longTerm,
    selected,
    totalConsidered: filteredCandidates.length,
    selectionReason: buildSelectionReason(context, selected, filteredCandidates.length),
  }

  return {
    selectedRecords,
    scored,
    workingMemory,
    context,
    executedAt: new Date().toISOString(),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyDomainFilter(records: MemoryRecord[], context: SelectionContext): MemoryRecord[] {
  // Explicit domains override module bias
  if (context.domains && context.domains.length > 0) {
    return records.filter((r) => (context.domains as MemoryDomain[]).includes(r.domain))
  }

  // Apply module bias as a soft pre-filter — bias domains score higher but others
  // are still included (to avoid missing high-relevance cross-domain records)
  // We do NOT exclude here; scoring handles the weight via domainMatch
  return records
}

function buildSelectionReason(
  context: SelectionContext,
  selected: ScoredMemoryRecord[],
  total: number,
): string {
  const parts: string[] = [`module:${context.module}`, `from ${total} candidates`]

  if (context.query) parts.push(`query:"${context.query.slice(0, 40)}"`)

  if (context.domains && context.domains.length > 0) {
    parts.push(`domains:[${context.domains.join(',')}]`)
  } else {
    const bias = MODULE_DOMAIN_BIAS[context.module]
    if (bias) parts.push(`bias:[${bias.join(',')}]`)
  }

  if (selected.length > 0) {
    const topScore = selected[0]?.score.totalScore.toFixed(2)
    parts.push(`top_score:${topScore}`)
  }

  return parts.join(' | ')
}
