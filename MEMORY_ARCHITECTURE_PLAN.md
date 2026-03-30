# Memory Architecture Plan

Updated: 2026-03-29

---

## Overview

Jarvis memory is a **structured, source-aware, cross-module backbone** grounded in SAFE_ROOT local storage. It is explicitly not a summarization layer or AI knowledge graph — it is an inspectable, queryable record system where every entry has an origin and a domain.

Memory is always available for reads. Writes are always staged under DRY_RUN. When DRY_RUN is lifted, writes go directly to `jarvis-runtime/memory/records.json`.

---

## Memory Domains

| Domain | Purpose | Auto-ingested? |
|--------|---------|----------------|
| `personal` | User preferences, personal context, context-anchor notes | Manual / file import |
| `project` | Architecture decisions, project knowledge, brainrepo | Manual / file import |
| `operational` | System events, session state, operational logs | System event ingestion |
| `people` | Contact history, relationships, interaction context | Manual / concierge |
| `receipts` | Completed/failed action outcomes | Auto (in-session) |
| `system` | Runtime/config state records | System event ingestion |

---

## Storage Strategy

### Primary store

```
jarvis-runtime/memory/records.json
```

- Array of `MemoryRecord` objects (typed JSON)
- Read via `readSafeJson` (existing SAFE_ROOT IPC path)
- Written under DRY_RUN flag (always staged until DRY_RUN=false + CAPABILITIES.write=true)
- No migration complexity: schema additions are additive (optional fields only)

### Supplementary sources (read-only, always live)

| Source | Path | Domain |
|--------|------|--------|
| Brainrepo | `jarvis-runtime/brainrepo/index.md` | project |
| Context anchor | `jarvis-runtime/context/anchor.md` | personal |
| Action receipts | In-session from `useActionRuntimeStore` | receipts |

The `GroundedMemoryProvider` merges all three sources transparently.

### Deduplication

- Records are deduplicated by `id` at the query layer
- IDs are deterministic for in-session receipts (`receipt_{actionId}`)
- Persisted records have generated IDs (`mem_{domain}_{timestamp}_{random}`)

---

## Record Shape

```typescript
interface MemoryRecord {
  id:          string               // stable unique ID
  domain:      MemoryDomain         // partitioned by domain
  title:       string               // human-readable summary
  content:     string               // full content
  sourceType:  MemorySourceType     // how it entered the system
  sourceRef:   string               // machine-readable origin ref
  tags:        string[]             // for filtering
  confidence:  MemoryConfidence     // verified | draft | inferred
  createdAt:   string               // ISO 8601
  updatedAt:   string               // ISO 8601
  provenance?: Record<string, unknown>  // extra source metadata
}
```

---

## Source Attribution

Every record has `sourceType` and `sourceRef` — no anonymous memory.

| sourceType | Example sourceRef | Written by |
|------------|------------------|-----------|
| `user_input` | `command` | User explicitly wrote the note |
| `action_receipt` | `action:act_abc123` | Auto-ingested from action outcome |
| `system_event` | `time-module` | Operational log from a module |
| `file_import` | `brainrepo/index.md` | Imported from safe-root file |
| `inferred` | `model-router` | System-derived (clearly labeled) |

---

## Write Behavior Under DRY_RUN

| Condition | Behavior |
|-----------|----------|
| `DRY_RUN=true` (current) | Write staged as `ActionRecord` in `useActionRuntimeStore` |
| `DRY_RUN=false` + `CAPABILITIES.write=true` | Write appended to `jarvis-runtime/memory/records.json` |

Staged writes appear in the action log and are recoverable. No data is lost — the staged `ActionRecord.payload` contains the full `MemoryRecord`.

---

## Provenance Rules

1. Every record must have `sourceType` — no `undefined` source
2. `inferred` sourceType must be used for any system-derived content
3. `confidence: 'verified'` only for records from authoritative sources (user input, action receipts)
4. `confidence: 'draft'` for staged/pending records
5. File-imported records always tag `['file-import', domain]`
6. Receipt records always tag `[domain, providerKey, status]`

---

## Cross-Module Memory Hooks

Located at `src/integrations/memory/hooks.ts`. All reads are live; no writes.

| Hook | Consumer | Purpose |
|------|----------|---------|
| `lookupCommandContext(text)` | Command module | Relevant memory before routing |
| `lookupContactMemory(name)` | Concierge | People + receipt context for a contact |
| `lookupAdminContext()` | Concierge | Recent operational + receipt context |
| `lookupSchedulingContext()` | Time module | Prior scheduling state |
| `lookupProjectContext(keywords)` | Dev / Builder | Project memory for a task |
| `lookupRecentExecutionReceipts()` | Dev / Builder | "What did we just do" |
| `lookupPersonalContext()` | Command / System | Context-anchor recovery |
| `lookupByTags(tags)` | Any module | Tag-based named memory |

---

## Source-Aware Ingestion

Located at `src/integrations/memory/ingestion.ts`.

| Helper | Input | Output |
|--------|-------|--------|
| `ingest(request)` | `MemoryIngestRequest` | `MemoryWriteResult` (staged) |
| `ingestReceipt(receipt)` | `ExecutionReceipt` | `MemoryWriteResult` (staged) |
| `ingestOperationalNote(domain, title, content, ref)` | strings | `MemoryWriteResult` (staged) |
| `ingestFileContent(domain, ref, rawText)` | markdown text | `MemoryWriteResult[]` (staged) |

All ingestion is staged. The returned `MemoryWriteResult.stagedActionId` identifies the pending write in the action store.

---

## Provider API

`GroundedMemoryProvider` implements `MemoryProvider` with both legacy and structured APIs.

### Legacy (unchanged, backward-compat)

```typescript
snapshot(): Promise<ProviderOperationResult<MemorySnapshot>>
search(query: string): Promise<ProviderOperationResult<GroundedMemoryEntry[]>>
write(scope, title, body, source): Promise<ProviderOperationResult<GroundedMemoryEntry>>
```

### Structured (new)

```typescript
query(filter: MemoryQuery): Promise<ProviderOperationResult<MemoryRecord[]>>
getById(id: string): Promise<ProviderOperationResult<MemoryRecord | null>>
ingest(request: MemoryIngestRequest): Promise<ProviderOperationResult<MemoryWriteResult>>
storeReport(): Promise<ProviderOperationResult<MemoryStoreReport>>
```

### Query filter

```typescript
interface MemoryQuery {
  domain?:     MemoryDomain | MemoryDomain[]   // domain filter
  tags?:       string[]                         // OR tag filter
  q?:          string                           // freetext search
  limit?:      number                           // default 50
  since?:      string                           // ISO date
  sourceType?: MemorySourceType
  confidence?: MemoryConfidence
}
```

---

## Current Status

| Item | Status |
|------|--------|
| Structured store | LIVE (empty, ready at `jarvis-runtime/memory/records.json`) |
| Personal memory (context-anchor) | LIVE_READ_ONLY (file empty — add content) |
| Project memory (brainrepo) | LIVE_READ_ONLY (file empty — add content) |
| In-session receipts | LIVE (converted from action store in-memory) |
| Write path | WIRED_BLOCKED_BY_DRY_RUN — all writes staged |
| Cross-module hooks | LIVE_WITH_SELECTION — use selection engine |
| Ingestion helpers | LIVE (staged output only) |
| Relevance scoring | LIVE — 6-dimension weighted scoring |
| Working memory | LIVE — short-term + long-term assembled per query |
| Feedback signals | LIVE (staged: markUseful / markIrrelevant) |
| Feedback store | LIVE_READ_ONLY — `jarvis-runtime/memory/feedback.json` |
| MemoryLiveStatus | `LIVE_WITH_SELECTION` — reported by `describe()` |

---

## Intelligence Layer

### Scoring Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| `recency` | 0.25 | Exponential decay (half-life 7 days) |
| `domainMatch` | 0.20 | 1.0 for exact domain match, 0.5 for no filter, 0.0 for mismatch |
| `tagMatch` | 0.20 | Fraction of context tags found in record tags |
| `sourcePriority` | 0.15 | `action_receipt:1.0, user_input:0.9, file_import:0.7, system_event:0.5, inferred:0.2` |
| `confidence` | 0.10 | `verified:1.0, draft:0.6, inferred:0.3` |
| `textMatch` | 0.10 | Token overlap between query and record title+content |
| `explicitBoost` | additive | Feedback signal from `markUseful` (+0.15) / `markIrrelevant` (-0.20) |

### Module Domain Bias

| Module | Preferred Domains |
|--------|-------------------|
| `command` | personal, project, operational |
| `concierge` | people, receipts, operational |
| `time` | operational, personal |
| `dev` | project, receipts, operational |
| `memory` | all domains |
| `system` | system, operational |

---

## File Map

| File | Role |
|------|------|
| `src/shared/memory-types.ts` | All canonical memory types, constants, intelligence layer types |
| `src/integrations/memory/memory-store.ts` | Read/write/query against SAFE_ROOT store |
| `src/integrations/memory/ingestion.ts` | Source-aware ingestion helpers |
| `src/integrations/memory/hooks.ts` | Cross-module read hooks (via selection engine) |
| `src/integrations/memory/memory-scoring.ts` | Pure relevance scoring functions |
| `src/integrations/memory/memory-selector.ts` | Selection engine — assembles and ranks working memory |
| `src/integrations/memory/feedback.ts` | Feedback signals (markUseful / markIrrelevant) |
| `src/integrations/providers/memory-provider.ts` | `GroundedMemoryProvider` (upgraded) |
| `src/integrations/contracts/providers.ts` | `MemoryProvider` interface (extended) |
| `src/components/tabs/MemoryOpsTab.tsx` | UI (domain stats, no visual change) |
| `jarvis-runtime/memory/records.json` | Live store (empty, write-ready) |
| `jarvis-runtime/memory/feedback.json` | Feedback boost/penalty store (empty, staged-write-ready) |

---

## Remaining Work

- Wire `ingestReceipt()` to auto-ingest action receipts as they complete (requires action store hook)
- Wire `lookupCommandContext()` into the model router for context-enriched classification
- Implement disk write path (when `CAPABILITIES.write=true` is set)
- Add CalDAV/contact import for `people` domain population
- Add brainrepo/context-anchor structured import via `ingestFileContent()` on demand
- Implement live feedback persistence (read-back from `feedback.json` after write path is enabled)
