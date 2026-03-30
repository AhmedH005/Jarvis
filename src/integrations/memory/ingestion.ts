/**
 * Memory ingestion helpers.
 *
 * All writes are staged under DRY_RUN — no disk mutations.
 * Each ingestion path attaches explicit source attribution.
 */

import type { ExecutionReceipt } from '@/integrations/contracts/base'
import type {
  MemoryDomain,
  MemoryIngestRequest,
  MemoryRecord,
  MemoryWriteResult,
} from '@/shared/memory-types'
import { buildRecord, stageRecordWrite } from './memory-store'

// ── Core ingest ───────────────────────────────────────────────────────────────

/**
 * Build and stage a memory record from a typed ingest request.
 * Returns the (not-yet-persisted) record and its staged action id.
 */
export function ingest(request: MemoryIngestRequest): MemoryWriteResult {
  const record    = buildRecord(request)
  const actionId  = stageRecordWrite(record)
  return { record, writeMode: 'staged', stagedActionId: actionId }
}

// ── Action receipt ingestion ─────────────────────────────────────────────────

/**
 * Convert a completed/failed action receipt to an ingest request.
 */
export function receiptToIngestRequest(receipt: ExecutionReceipt): MemoryIngestRequest {
  const tags: string[] = [
    receipt.domain,
    receipt.providerKey,
    receipt.status,
  ]

  return {
    domain:     'receipts',
    title:      receipt.summary,
    content:    [
      `Domain: ${receipt.domain}`,
      `Provider: ${receipt.providerKey}`,
      `Status: ${receipt.status}`,
      ...(receipt.metadata ? [`Metadata: ${JSON.stringify(receipt.metadata)}`] : []),
    ].join('\n'),
    sourceType: 'action_receipt',
    sourceRef:  `action:${receipt.actionId}`,
    tags,
    confidence: receipt.status === 'completed' ? 'verified' : 'draft',
    provenance: {
      actionId:    receipt.actionId,
      receiptId:   receipt.id,
      domain:      receipt.domain,
      providerKey: receipt.providerKey,
      status:      receipt.status,
    },
  }
}

/**
 * Ingest a single action receipt as a staged memory write.
 */
export function ingestReceipt(receipt: ExecutionReceipt): MemoryWriteResult {
  return ingest(receiptToIngestRequest(receipt))
}

// ── Operational note ingestion ───────────────────────────────────────────────

/**
 * Ingest an operational note from a module.
 * Use this for system events, state snapshots, or module-specific logs.
 */
export function ingestOperationalNote(
  domain: MemoryDomain,
  title: string,
  content: string,
  sourceRef: string,
  tags: string[] = [],
): MemoryWriteResult {
  return ingest({
    domain,
    title,
    content,
    sourceType: 'system_event',
    sourceRef,
    tags:       ['operational', ...tags],
    confidence: 'verified',
  })
}

// ── File-import ingestion ────────────────────────────────────────────────────

/**
 * Ingest a block of text read from a safe-root file (e.g. brainrepo/index.md).
 * Splits the content into individual records by top-level heading.
 */
export function ingestFileContent(
  domain: MemoryDomain,
  fileRef: string,
  rawText: string,
): MemoryWriteResult[] {
  const sections = splitIntoSections(rawText)
  return sections.map((section) =>
    ingest({
      domain,
      title:      section.title,
      content:    section.body,
      sourceType: 'file_import',
      sourceRef:  fileRef,
      tags:       ['file-import', domain],
      confidence: 'verified',
    }),
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TextSection {
  title: string
  body:  string
}

/** Split markdown text into sections at # headings */
function splitIntoSections(text: string): TextSection[] {
  const lines = text.split(/\r?\n/)
  const sections: TextSection[] = []
  let current: TextSection | null = null

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (current) sections.push(current)
      current = { title: line.replace(/^#+\s*/, '').trim(), body: '' }
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line
    } else if (line.trim()) {
      // Content before any heading — treat as a section with the file ref as title
      current = { title: 'Notes', body: line }
    }
  }
  if (current && (current.title || current.body.trim())) {
    sections.push(current)
  }

  // If no sections found, return the whole text as a single record
  if (sections.length === 0 && text.trim()) {
    return [{ title: 'Imported note', body: text.trim() }]
  }

  return sections.filter((s) => s.title || s.body.trim())
}

// ── Batch helpers ─────────────────────────────────────────────────────────────

/**
 * Extract and deduplicate records from ingestion results.
 */
export function collectIngestedRecords(results: MemoryWriteResult[]): MemoryRecord[] {
  const seen = new Set<string>()
  return results
    .map((r) => r.record)
    .filter((rec) => {
      if (seen.has(rec.id)) return false
      seen.add(rec.id)
      return true
    })
}
