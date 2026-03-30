/**
 * Shared memory types for the structured cross-module memory system.
 * These are the canonical types for all memory operations in Jarvis.
 */

// ── Domain taxonomy ──────────────────────────────────────────────────────────

/**
 * Memory is partitioned into six domains.
 * Each domain has distinct write/retrieval semantics and different consumers.
 */
export type MemoryDomain =
  | 'personal'      // user preferences, personal context, anchors
  | 'project'       // project knowledge, decisions, architecture notes
  | 'operational'   // system events, session logs, operational state
  | 'people'        // contacts, relationships, interaction history
  | 'receipts'      // completed/failed action outcomes (auto-ingested)
  | 'system'        // runtime/config/safety state records

// ── Source attribution ───────────────────────────────────────────────────────

/**
 * How a memory record entered the system.
 * Every record must have a sourceType — no anonymous memory.
 */
export type MemorySourceType =
  | 'user_input'      // written directly by the user
  | 'action_receipt'  // auto-ingested from a completed or failed action
  | 'system_event'    // operational log, state snapshot
  | 'file_import'     // read from a safe-root file (brainrepo, context-anchor)
  | 'inferred'        // derived (clearly labeled as such, not asserted as fact)

// ── Confidence ───────────────────────────────────────────────────────────────

export type MemoryConfidence =
  | 'verified'  // user confirmed or directly read from authoritative source
  | 'draft'     // staged or pending confirmation
  | 'inferred'  // system-derived, not explicitly stated

// ── Core record type ─────────────────────────────────────────────────────────

export interface MemoryRecord {
  id: string
  domain: MemoryDomain
  title: string
  content: string
  sourceType: MemorySourceType
  /** Human-readable source reference, e.g. 'brainrepo', 'action:xyz', 'gmail:abc' */
  sourceRef: string
  tags: string[]
  confidence: MemoryConfidence
  createdAt: string
  updatedAt: string
  /** Optional extra metadata — provider-specific fields */
  provenance?: Record<string, unknown>
}

// ── Query types ──────────────────────────────────────────────────────────────

export interface MemoryQuery {
  /** Filter to one or more domains */
  domain?: MemoryDomain | MemoryDomain[]
  /** Filter by tags (OR logic) */
  tags?: string[]
  /** Freetext search over title + content + sourceRef */
  q?: string
  /** Max records to return (default: 20) */
  limit?: number
  /** Only return records updated/created after this ISO date */
  since?: string
  /** Filter by source type */
  sourceType?: MemorySourceType
  /** Filter by confidence */
  confidence?: MemoryConfidence
}

export interface MemoryQueryResult {
  records: MemoryRecord[]
  totalCount: number
  /** Domains actually present in results */
  domains: MemoryDomain[]
}

// ── Write / ingest types ─────────────────────────────────────────────────────

export interface MemoryIngestRequest {
  domain: MemoryDomain
  title: string
  content: string
  sourceType: MemorySourceType
  sourceRef: string
  tags?: string[]
  confidence?: MemoryConfidence
  provenance?: Record<string, unknown>
}

export interface MemoryWriteResult {
  record: MemoryRecord
  /** 'live' when written to disk; 'staged' when DRY_RUN blocks the write */
  writeMode: 'live' | 'staged'
  stagedActionId?: string
}

// ── Domain metadata ──────────────────────────────────────────────────────────

export interface MemoryDomainStats {
  domain: MemoryDomain
  count: number
  latestUpdatedAt: string | null
}

export interface MemoryStoreReport {
  totalRecords: number
  domains: MemoryDomainStats[]
  storeStatus: 'live' | 'empty' | 'unavailable'
  storeSource: string
}

// ── Constants ────────────────────────────────────────────────────────────────

export const ALL_MEMORY_DOMAINS: MemoryDomain[] = [
  'personal',
  'project',
  'operational',
  'people',
  'receipts',
  'system',
]

export const DOMAIN_LABELS: Record<MemoryDomain, string> = {
  personal:    'Personal',
  project:     'Project',
  operational: 'Operational',
  people:      'People',
  receipts:    'Receipts',
  system:      'System',
}

// ── Intelligence layer types ─────────────────────────────────────────────────

/**
 * Memory-specific live status.
 * Separate from ProviderLiveStatus so memory-specific states don't pollute
 * the shared provider status model.
 */
export type MemoryLiveStatus =
  /** Reads live + ranked selection engine active */
  | 'LIVE_WITH_SELECTION'
  /** Reads live, raw query only (no selection engine) */
  | 'LIVE_READ_ONLY'
  /** Reads live, writes staged under DRY_RUN */
  | 'WIRED_BLOCKED_BY_DRY_RUN'
  /** Store/bridge unreachable */
  | 'UNAVAILABLE'

/**
 * Configurable weights for the relevance scoring model.
 * All weights should sum to 1.0 for a normalized total score.
 */
export interface ScoringWeights {
  recency:        number  // time-decay score
  domainMatch:    number  // domain alignment with context
  tagMatch:       number  // fraction of query tags matching record tags
  sourcePriority: number  // source type reliability ranking
  confidence:     number  // record confidence level
  textMatch:      number  // token overlap with query text
}

/**
 * Per-dimension breakdown for a single record's relevance score.
 * Every score is 0.0–1.0. totalScore is a weighted combination.
 */
export interface RecordScore {
  recordId: string
  totalScore: number
  breakdown: {
    recency:        number
    domainMatch:    number
    tagMatch:       number
    sourcePriority: number
    confidence:     number
    textMatch:      number
    explicitBoost:  number  // from feedback signals
  }
  /** Plain-text explanation of the top scoring factors */
  reasoning: string
}

/** A memory record paired with its relevance score */
export interface ScoredMemoryRecord {
  record: MemoryRecord
  score:  RecordScore
}

/** The module requesting memory, used to determine domain bias */
export type MemoryConsumerModule =
  | 'command'
  | 'concierge'
  | 'time'
  | 'dev'
  | 'memory'
  | 'system'

/**
 * Context passed to the selection engine.
 * At minimum, `module` is required — everything else narrows the selection.
 */
export interface SelectionContext {
  module:             MemoryConsumerModule
  query?:             string           // freetext query
  domains?:           MemoryDomain[]   // explicit domain filter (overrides module bias)
  tags?:              string[]
  limit?:             number           // default 10
  includeShortTerm?:  boolean          // include in-session receipts (default true)
}

/**
 * Structured short-term / long-term working memory snapshot.
 * Short-term = in-session receipts. Long-term = persisted store.
 */
export interface WorkingMemory {
  shortTerm:         MemoryRecord[]
  longTerm:          MemoryRecord[]
  selected:          ScoredMemoryRecord[]
  totalConsidered:   number
  selectionReason:   string
}

/**
 * Full output from the selection engine.
 */
export interface SelectionResult {
  /** Just the records — for easy consumption by hooks */
  selectedRecords: MemoryRecord[]
  /** Records with scores attached — for diagnostics */
  scored:          ScoredMemoryRecord[]
  workingMemory:   WorkingMemory
  context:         SelectionContext
  executedAt:      string
}
