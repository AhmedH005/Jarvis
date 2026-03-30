/**
 * Memory store — reads persisted records from SAFE_ROOT and merges in-session
 * receipts from the action runtime store.
 *
 * Writes are always staged under DRY_RUN. No disk mutation happens here.
 */

import { readSafeJson } from '@/integrations/runtime/files'
import { stageAction } from '@/integrations/runtime/safety'
import { useActionRuntimeStore } from '@/store/action-runtime'
import type {
  MemoryRecord,
  MemoryDomain,
  MemoryIngestRequest,
  MemoryQuery,
  MemoryDomainStats,
  MemoryStoreReport,
  MemorySourceType,
  MemoryConfidence,
} from '@/shared/memory-types'

const RECORDS_PATH = 'memory/records.json'

// ── ID generation ─────────────────────────────────────────────────────────────

export function generateMemoryId(domain: MemoryDomain): string {
  return `mem_${domain}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// ── In-session receipts as MemoryRecords ──────────────────────────────────────

/**
 * Convert in-session action receipts to MemoryRecords.
 * These are never persisted to disk but are available for in-session queries.
 */
export function sessionReceiptsAsRecords(): MemoryRecord[] {
  return useActionRuntimeStore
    .getState()
    .receipts
    .map((receipt) => ({
      id:         `receipt_${receipt.id}`,
      domain:     'receipts' as MemoryDomain,
      title:      receipt.summary,
      content:    `domain=${receipt.domain} provider=${receipt.providerKey} status=${receipt.status}`,
      sourceType: 'action_receipt' as MemorySourceType,
      sourceRef:  `action:${receipt.actionId}`,
      tags:       [receipt.domain, receipt.providerKey, receipt.status],
      confidence: 'verified' as MemoryConfidence,
      createdAt:  receipt.createdAt,
      updatedAt:  receipt.createdAt,
      provenance: receipt.metadata as Record<string, unknown> | undefined,
    }))
}

// ── Persisted store ───────────────────────────────────────────────────────────

/**
 * Load records persisted in SAFE_ROOT/memory/records.json.
 * Returns empty array if file does not exist or is empty.
 */
export async function loadPersistedRecords(): Promise<MemoryRecord[]> {
  return readSafeJson<MemoryRecord[]>(RECORDS_PATH, [])
}

// ── Query ─────────────────────────────────────────────────────────────────────

function matchesQuery(record: MemoryRecord, filter: MemoryQuery): boolean {
  // Domain filter
  if (filter.domain !== undefined) {
    const domains = Array.isArray(filter.domain) ? filter.domain : [filter.domain]
    if (!domains.includes(record.domain)) return false
  }

  // Tag filter (OR: record must have at least one of the requested tags)
  if (filter.tags && filter.tags.length > 0) {
    const recordTagSet = new Set(record.tags.map((tag) => tag.toLowerCase()))
    if (!filter.tags.some((tag) => recordTagSet.has(tag.toLowerCase()))) return false
  }

  // Freetext search
  if (filter.q) {
    const lower = filter.q.toLowerCase()
    const searchable = `${record.title} ${record.content} ${record.sourceRef} ${record.tags.join(' ')}`.toLowerCase()
    if (!searchable.includes(lower)) return false
  }

  // Since filter
  if (filter.since) {
    if (record.updatedAt < filter.since && record.createdAt < filter.since) return false
  }

  // Source type filter
  if (filter.sourceType && record.sourceType !== filter.sourceType) return false

  // Confidence filter
  if (filter.confidence && record.confidence !== filter.confidence) return false

  return true
}

/**
 * Query all available records.
 * Merges persisted records with in-session receipts for the receipts domain.
 */
export async function queryRecords(filter: MemoryQuery = {}): Promise<MemoryRecord[]> {
  const persisted = await loadPersistedRecords()

  // Include in-session receipts when the query covers the receipts domain (or all domains)
  const wantsReceipts =
    filter.domain === undefined ||
    filter.domain === 'receipts' ||
    (Array.isArray(filter.domain) && filter.domain.includes('receipts'))

  const all = wantsReceipts
    ? [...persisted, ...sessionReceiptsAsRecords()]
    : persisted

  const deduplicated = Array.from(
    new Map(all.map((record) => [record.id, record] as const)).values(),
  )

  const matched = deduplicated.filter((record) => matchesQuery(record, filter))

  // Stable sort: newest first
  matched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const limit = Number.isFinite(filter.limit) ? Math.max(0, Math.min(Math.floor(filter.limit as number), 200)) : 50
  return matched.slice(0, limit)
}

/**
 * Retrieve a single record by id (persisted + in-session receipts).
 */
export async function getRecordById(id: string): Promise<MemoryRecord | null> {
  const persisted = await loadPersistedRecords()
  const receipts  = sessionReceiptsAsRecords()
  return [...persisted, ...receipts].find((r) => r.id === id) ?? null
}

/**
 * List all records in a specific domain.
 */
export async function listRecordsByDomain(domain: MemoryDomain): Promise<MemoryRecord[]> {
  return queryRecords({ domain })
}

// ── Write (staged) ────────────────────────────────────────────────────────────

/**
 * Build a MemoryRecord from an ingest request.
 * The record is not persisted — it represents what would be written.
 */
export function buildRecord(request: MemoryIngestRequest): MemoryRecord {
  const ts = new Date().toISOString()
  return {
    id:         generateMemoryId(request.domain),
    domain:     request.domain,
    title:      request.title,
    content:    request.content,
    sourceType: request.sourceType,
    sourceRef:  request.sourceRef,
    tags:       request.tags ?? [],
    confidence: request.confidence ?? 'draft',
    createdAt:  ts,
    updatedAt:  ts,
    provenance: request.provenance,
  }
}

/**
 * Stage a memory record write.
 * Under DRY_RUN this is always staged — never written to disk.
 * Returns the staged record and the action id.
 */
export function stageRecordWrite(record: MemoryRecord): string {
  const actionId = stageAction({
    domain:      'memory',
    providerKey: 'memory-skill-provider',
    title:       `Stage memory write [${record.domain}]`,
    summary:     `Memory record "${record.title}" staged for ${record.domain} domain.`,
    payload:     record,
  })
  return actionId
}

// ── Store report ─────────────────────────────────────────────────────────────

export async function buildStoreReport(): Promise<MemoryStoreReport> {
  const persisted = await loadPersistedRecords()
  const receipts  = sessionReceiptsAsRecords()
  const all       = [...persisted, ...receipts]

  if (all.length === 0 && persisted.length === 0) {
    return {
      totalRecords: 0,
      domains:      [],
      storeStatus:  'empty',
      storeSource:  `SAFE_ROOT/${RECORDS_PATH}`,
    }
  }

  const domainMap = new Map<MemoryDomain, { count: number; latest: string | null }>()
  for (const record of all) {
    const entry = domainMap.get(record.domain) ?? { count: 0, latest: null }
    entry.count++
    if (!entry.latest || record.updatedAt > entry.latest) {
      entry.latest = record.updatedAt
    }
    domainMap.set(record.domain, entry)
  }

  const domains: MemoryDomainStats[] = Array.from(domainMap.entries()).map(([domain, stats]) => ({
    domain,
    count:           stats.count,
    latestUpdatedAt: stats.latest,
  })).sort((left, right) => left.domain.localeCompare(right.domain))

  return {
    totalRecords: all.length,
    domains,
    storeStatus:  'live',
    storeSource:  `SAFE_ROOT/${RECORDS_PATH}`,
  }
}
