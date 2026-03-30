import { readSafeFile } from '@/integrations/runtime/files'
import { computeProviderLiveStatus } from '@/integrations/runtime/safety'
import { loadSkillManifest } from '@/integrations/skills/loader'
import { useActionRuntimeStore } from '@/store/action-runtime'
import type {
  GroundedMemoryEntry,
  MemoryProvider,
  MemorySnapshot,
} from '@/integrations/contracts/providers'
import type { ProviderDescriptor, ProviderOperationResult } from '@/integrations/contracts/base'
import { stagedResult, successResult } from '@/integrations/contracts/result-helpers'
import type {
  MemoryRecord,
  MemoryQuery,
  MemoryIngestRequest,
  MemoryWriteResult,
  MemoryStoreReport,
  MemoryLiveStatus,
} from '@/shared/memory-types'
import {
  queryRecords,
  getRecordById,
  buildRecord,
  stageRecordWrite,
  buildStoreReport,
} from '@/integrations/memory/memory-store'
import { ingest } from '@/integrations/memory/ingestion'
import { enforce, toOperationResult } from '@/integrations/governance/governance-enforcer'

function now(): string {
  return new Date().toISOString()
}

// ── Legacy compat helpers ─────────────────────────────────────────────────────

function toLines(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function toEntries(lines: string[], scope: 'personal' | 'project', source: string): GroundedMemoryEntry[] {
  return lines.slice(0, 12).map((line, index) => ({
    id:        `${scope}_${index}_${line.slice(0, 12).replace(/\W+/g, '_')}`,
    scope,
    title:     line.startsWith('#') ? line.replace(/^#+\s*/, '') : `${scope} memory ${index + 1}`,
    body:      line,
    source,
    createdAt: now(),
  }))
}

function toReceiptEntries(): GroundedMemoryEntry[] {
  return useActionRuntimeStore
    .getState()
    .receipts
    .slice(0, 12)
    .map((receipt) => ({
      id:        receipt.id,
      scope:     'receipt' as const,
      title:     receipt.summary,
      body:      `${receipt.domain} · ${receipt.providerKey} · ${receipt.status}`,
      source:    receipt.providerKey,
      createdAt: receipt.createdAt,
      metadata:  receipt.metadata,
    }))
}

/** Convert a MemoryRecord to a legacy GroundedMemoryEntry */
function recordToEntry(record: MemoryRecord): GroundedMemoryEntry {
  const scope: GroundedMemoryEntry['scope'] =
    record.domain === 'personal'  ? 'personal'
    : record.domain === 'project' ? 'project'
    : 'receipt'
  return {
    id:        record.id,
    scope,
    title:     record.title,
    body:      record.content,
    source:    record.sourceRef,
    createdAt: record.createdAt,
    metadata:  record.provenance,
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class GroundedMemoryProvider implements MemoryProvider {
  readonly key   = 'memory-skill-provider'
  readonly label = 'Memory Skill Provider'

  async describe(): Promise<ProviderDescriptor<{
    searchMemory:        boolean
    writeMemory:         boolean
    operationalReceipts: boolean
  }>> {
    const [brainrepo, contextAnchor, report] = await Promise.all([
      loadSkillManifest('brainrepo'),
      loadSkillManifest('context-anchor'),
      buildStoreReport(),
    ])

    const providerStatus = computeProviderLiveStatus({
      runtimeAvailable: true,
      keyPresentInEnv:  true,   // no external API key required
      keyAccessible:    true,
      networkEnabled:   true,   // reads are local
      executeEnabled:   true,
    })

    // Memory-specific live status — selection engine is always active for reads
    const memoryLiveStatus: MemoryLiveStatus = 'LIVE_WITH_SELECTION'

    const domainSummary = report.domains.length > 0
      ? report.domains.map((d) => `${d.domain}:${d.count}`).join(', ')
      : 'empty'

    return {
      key:   this.key,
      label: this.label,
      capabilities: {
        searchMemory:        true,
        writeMemory:         false,
        operationalReceipts: true,
      },
      health: {
        state:     'ready',
        liveStatus: providerStatus,
        detail:    `${brainrepo.label} and ${contextAnchor.label} active in SAFE_ROOT. Structured store: ${report.storeStatus} (${report.totalRecords} records). Domains: [${domainSummary}]. Intelligence layer: ${memoryLiveStatus}. Writes staged (DRY_RUN).`,
        missing:   ['DRY_RUN', 'write=false'],
        checkedAt: now(),
      },
    }
  }

  // ── Legacy API ─────────────────────────────────────────────────────────────

  async snapshot(): Promise<ProviderOperationResult<MemorySnapshot>> {
    const [brainrepoIndex, contextAnchor] = await Promise.all([
      readSafeFile('brainrepo/index.md'),
      readSafeFile('context/anchor.md'),
    ])

    const projectMemory      = toEntries(toLines(brainrepoIndex), 'project', 'brainrepo')
    const personalMemory     = toEntries(toLines(contextAnchor),  'personal', 'context-anchor')
    const operationalReceipts = toReceiptEntries()

    // Also pull from structured store for project + personal domains
    const structuredRecords = await queryRecords({
      domain: ['personal', 'project'],
      limit:  20,
    })

    const fromStructured = structuredRecords.map(recordToEntry)
    const mergedProject  = deduplicateEntries([...projectMemory,  ...fromStructured.filter((e) => e.scope === 'project')])
    const mergedPersonal = deduplicateEntries([...personalMemory, ...fromStructured.filter((e) => e.scope === 'personal')])

    return successResult(
      {
        providerKey: this.key,
        action: 'memory:snapshot',
        metadata: {
          personalCount: mergedPersonal.length,
          projectCount: mergedProject.length,
          receiptCount: operationalReceipts.length,
        },
      },
      'Loaded grounded memory from the safe runtime.',
      {
        stateLines: [
          'Brainrepo mounted in SAFE_ROOT',
          'Context anchor mounted in SAFE_ROOT',
          `Structured store: ${structuredRecords.length} additional records`,
          'Writes are staged (dry run)',
        ],
        recentSummary:        mergedPersonal.map((entry) => entry.body),
        decisions:            mergedProject.map((entry) => entry.body),
        dailyMemoryExists:    Boolean(brainrepoIndex),
        dailyMemoryPath:      'jarvis-runtime/brainrepo/index.md',
        personalMemory:       mergedPersonal,
        projectMemory:        mergedProject,
        operationalReceipts,
      },
      'readOnlySuccess',
    )
  }

  async search(query: string): Promise<ProviderOperationResult<GroundedMemoryEntry[]>> {
    const snapshot = await this.snapshot()
    const entries = snapshot.data
      ? [
          ...snapshot.data.personalMemory,
          ...snapshot.data.projectMemory,
          ...snapshot.data.operationalReceipts,
        ]
      : []
    const lower = query.trim().toLowerCase()
    const matches = !lower
      ? entries
      : entries.filter((entry) =>
          `${entry.title} ${entry.body} ${entry.source}`.toLowerCase().includes(lower),
        )

    return successResult(
      {
        providerKey: this.key,
        action: 'memory:search',
        metadata: { query, count: matches.length },
      },
      matches.length > 0
        ? `Found ${matches.length} memory match${matches.length === 1 ? '' : 'es'}.`
        : 'No memory matches found in the safe runtime.',
      matches,
      'readOnlySuccess',
    )
  }

  async write(
    scope: 'personal' | 'project',
    title: string,
    body: string,
    source: string,
  ): Promise<ProviderOperationResult<GroundedMemoryEntry>> {
    const gov = await enforce('brainrepo', this.key, 'memory:write', ['write_files'], true)
    if (!gov.allowed) return toOperationResult(gov)
    // Delegate to structured ingest
    const domain = scope === 'personal' ? 'personal' : 'project'
    const result = ingest({
      domain,
      title,
      content:    body,
      sourceType: 'user_input',
      sourceRef:  source,
      tags:       [domain, 'user-write'],
      confidence: 'draft',
    })

    return stagedResult(
      {
        providerKey: this.key,
        action: 'memory:write',
        auditEntryId: gov.auditEntryId,
        stagedActionId: result.stagedActionId,
        metadata: { scope, source },
      },
      `Memory write staged as action ${result.stagedActionId}.`,
      {
        id:        result.record.id,
        scope,
        title,
        body,
        source,
        createdAt: result.record.createdAt,
      },
      { status: 'blockedByDryRun', notes: ['Writes remain staged until DRY_RUN is disabled.'] },
    )
  }

  // ── Structured API ─────────────────────────────────────────────────────────

  async query(filter: MemoryQuery): Promise<ProviderOperationResult<MemoryRecord[]>> {
    const records = await queryRecords(filter)
    return successResult(
      {
        providerKey: this.key,
        action: 'memory:query',
        metadata: { count: records.length, limit: filter.limit ?? null },
      },
      `Found ${records.length} record${records.length === 1 ? '' : 's'}.`,
      records,
      'readOnlySuccess',
    )
  }

  async getById(id: string): Promise<ProviderOperationResult<MemoryRecord | null>> {
    const record = await getRecordById(id)
    return successResult(
      { providerKey: this.key, action: 'memory:getById', metadata: { id, found: Boolean(record) } },
      record ? `Found record "${record.title}".` : `No record found with id ${id}.`,
      record,
      'readOnlySuccess',
    )
  }

  async ingest(request: MemoryIngestRequest): Promise<ProviderOperationResult<MemoryWriteResult>> {
    const gov = await enforce('brainrepo', this.key, 'memory:ingest', ['write_files'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const result = ingest(request)
    return stagedResult(
      {
        providerKey: this.key,
        action: 'memory:ingest',
        auditEntryId: gov.auditEntryId,
        stagedActionId: result.stagedActionId,
        metadata: { domain: request.domain, title: request.title },
      },
      `Memory record "${request.title}" staged as action ${result.stagedActionId}.`,
      result,
      { status: 'blockedByDryRun', notes: ['Structured memory writes remain staged until DRY_RUN is disabled.'] },
    )
  }

  async storeReport(): Promise<ProviderOperationResult<MemoryStoreReport>> {
    const report = await buildStoreReport()
    return successResult(
      {
        providerKey: this.key,
        action: 'memory:storeReport',
        metadata: { totalRecords: report.totalRecords, domains: report.domains.length },
      },
      `Memory store: ${report.storeStatus}, ${report.totalRecords} records across ${report.domains.length} domains.`,
      report,
      'readOnlySuccess',
    )
  }
}

// ── Util ──────────────────────────────────────────────────────────────────────

function deduplicateEntries(entries: GroundedMemoryEntry[]): GroundedMemoryEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}
