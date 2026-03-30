/**
 * Pure relevance scoring functions for the memory selection engine.
 * All functions are stateless — no I/O, no side effects.
 */

import type {
  MemoryRecord,
  MemoryDomain,
  MemoryConfidence,
  MemorySourceType,
  RecordScore,
  ScoringWeights,
  SelectionContext,
} from '@/shared/memory-types'

// ── Default weights ────────────────────────────────────────────────────────────

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  recency:        0.25,
  domainMatch:    0.20,
  tagMatch:       0.20,
  sourcePriority: 0.15,
  confidence:     0.10,
  textMatch:      0.10,
}

// ── Source priority table ──────────────────────────────────────────────────────

const SOURCE_PRIORITY: Record<MemorySourceType, number> = {
  action_receipt: 1.0,
  user_input:     0.9,
  file_import:    0.7,
  system_event:   0.5,
  inferred:       0.2,
}

// ── Confidence score table ────────────────────────────────────────────────────

const CONFIDENCE_SCORE: Record<MemoryConfidence, number> = {
  verified: 1.0,
  draft:    0.6,
  inferred: 0.3,
}

// ── Individual score functions ────────────────────────────────────────────────

/**
 * Time-decay recency score.
 * Full score for records updated within the last hour; decays exponentially.
 * Half-life ≈ 7 days (604800s).
 */
export function scoreRecency(record: MemoryRecord): number {
  const ageMs = Date.now() - new Date(record.updatedAt).getTime()
  const ageDays = ageMs / 86_400_000
  return Math.exp(-ageDays / 7)
}

/**
 * Domain match — 1.0 for exact domain match, 0.5 for no explicit filter (all match),
 * 0.0 for a mismatched domain.
 */
export function scoreDomainMatch(record: MemoryRecord, context: SelectionContext): number {
  if (context.domains && context.domains.length > 0) {
    return context.domains.includes(record.domain) ? 1.0 : 0.0
  }

  const bias = MODULE_DOMAIN_BIAS[context.module]
  if (!bias || bias.length === 0) return 0.5
  return bias.includes(record.domain) ? 1.0 : 0.25
}

/**
 * Tag overlap — fraction of context tags found in record tags (OR logic).
 * Returns 0 if no context tags are specified.
 */
export function scoreTagMatch(record: MemoryRecord, context: SelectionContext): number {
  if (!context.tags || context.tags.length === 0) return 0.0
  const recordTagSet = new Set(record.tags.map((t) => t.toLowerCase()))
  const requestedTags = Array.from(new Set(context.tags.map((t) => t.toLowerCase())))
  const matched = requestedTags.filter((t) => recordTagSet.has(t)).length
  return requestedTags.length > 0 ? matched / requestedTags.length : 0.0
}

/** Source reliability — from SOURCE_PRIORITY table */
export function scoreSourcePriority(record: MemoryRecord): number {
  return SOURCE_PRIORITY[record.sourceType] ?? 0.3
}

/** Confidence level score — from CONFIDENCE_SCORE table */
export function scoreConfidence(record: MemoryRecord): number {
  return CONFIDENCE_SCORE[record.confidence] ?? 0.3
}

/**
 * Token overlap between query string and record title+content.
 * Simple bag-of-words — no stemming.
 */
export function scoreTextMatch(record: MemoryRecord, context: SelectionContext): number {
  if (!context.query) return 0.0
  const queryTokens = tokenize(context.query)
  if (queryTokens.length === 0) return 0.0
  const recordText = `${record.title} ${record.content} ${record.sourceRef}`.toLowerCase()
  const matched = queryTokens.filter((t) => recordText.includes(t)).length
  return matched / queryTokens.length
}

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2),
    ),
  )
}

// ── Module domain bias ─────────────────────────────────────────────────────────

/**
 * Domains weighted toward each consumer module.
 * Used by the selector to apply a soft domain preference when no explicit filter is set.
 */
export const MODULE_DOMAIN_BIAS: Record<string, MemoryDomain[]> = {
  command:   ['personal', 'project', 'operational'],
  concierge: ['people', 'receipts', 'operational'],
  time:      ['operational', 'personal'],
  dev:       ['project', 'receipts', 'operational'],
  memory:    ['personal', 'project', 'operational', 'people', 'receipts', 'system'],
  system:    ['system', 'operational'],
}

// ── Composite scorer ──────────────────────────────────────────────────────────

/**
 * Score a single record given the selection context.
 * `explicitBoost` comes from the feedback store (markUseful / markIrrelevant).
 */
export function scoreRecord(
  record: MemoryRecord,
  context: SelectionContext,
  explicitBoost: number,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): RecordScore {
  const recency        = scoreRecency(record)
  const domainMatch    = scoreDomainMatch(record, context)
  const tagMatch       = scoreTagMatch(record, context)
  const sourcePriority = scoreSourcePriority(record)
  const confidence     = scoreConfidence(record)
  const textMatch      = scoreTextMatch(record, context)

  const weightedSum =
    recency        * weights.recency        +
    domainMatch    * weights.domainMatch    +
    tagMatch       * weights.tagMatch       +
    sourcePriority * weights.sourcePriority +
    confidence     * weights.confidence     +
    textMatch      * weights.textMatch

  // Boost is additive and clamped to [0, 1]
  const totalScore = Math.min(1.0, Math.max(0.0, weightedSum + explicitBoost))

  const reasons: string[] = []
  if (domainMatch === 1.0) reasons.push(`domain:${record.domain}`)
  if (tagMatch > 0)        reasons.push(`tags(${(tagMatch * 100).toFixed(0)}%)`)
  if (textMatch > 0.5)     reasons.push(`text(${(textMatch * 100).toFixed(0)}%)`)
  if (recency > 0.8)       reasons.push('recent')
  if (explicitBoost > 0)   reasons.push(`boost+${explicitBoost.toFixed(2)}`)
  if (explicitBoost < 0)   reasons.push(`penalty${explicitBoost.toFixed(2)}`)

  return {
    recordId: record.id,
    totalScore,
    breakdown: { recency, domainMatch, tagMatch, sourcePriority, confidence, textMatch, explicitBoost },
    reasoning: reasons.length > 0 ? reasons.join(', ') : 'base scoring only',
  }
}
