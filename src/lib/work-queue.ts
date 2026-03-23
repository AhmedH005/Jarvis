import type { AgentPersonaId } from '@/adapters/agent-control'
import type { BuilderExecutionRequest } from '@/adapters/builder-execution-request'
import type { BuilderExecutionRun, BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'

// ── Queue item model ──────────────────────────────────────────────────────────

export type WorkQueueKind =
  | 'in-progress'
  | 'awaiting-approval'
  | 'approved-ready'
  | 'remediation-pending'
  | 'needs-remediation'
  | 'awaiting-verification'

export type WorkQueueTargetFilter = 'all' | 'app' | 'package' | 'docs' | 'repo'

export interface WorkQueueItem {
  id:                 string
  kind:               WorkQueueKind
  summary:            string
  targetLabel:        string
  targetId:           string
  targetType:         string
  recommendedAgent:   AgentPersonaId
  // pipeline artifact links
  requestId?:         string
  runId?:             string
  sourceRunId?:       string
  // state snapshots
  approvalState?:     string
  executionState?:    string
  verificationState?: string
  remediationKind?:   string
  // provenance
  source:             'real-bridge' | 'local-demo-fallback'
  note:               string
  // primary timestamp for display
  primaryTs:          string
  primaryTsLabel:     string
}

// ── Kind metadata ─────────────────────────────────────────────────────────────

export const QUEUE_KIND_META: Record<WorkQueueKind, {
  label:  string
  color:  string
  bg:     string
  border: string
}> = {
  'in-progress':          { label: 'IN PROGRESS',          color: '#00d4ff', bg: 'rgba(0,212,255,0.10)',  border: 'rgba(0,212,255,0.22)'  },
  'awaiting-approval':    { label: 'AWAITING APPROVAL',    color: '#ffc84a', bg: 'rgba(255,200,74,0.10)',  border: 'rgba(255,200,74,0.22)'  },
  'approved-ready':       { label: 'APPROVED · READY',     color: '#00ff88', bg: 'rgba(0,255,136,0.10)',  border: 'rgba(0,255,136,0.22)'  },
  'remediation-pending':  { label: 'REMEDIATION PENDING',  color: '#ffb86b', bg: 'rgba(255,184,107,0.10)', border: 'rgba(255,184,107,0.22)' },
  'needs-remediation':    { label: 'NEEDS REMEDIATION',    color: '#ff6b35', bg: 'rgba(255,107,53,0.10)',  border: 'rgba(255,107,53,0.22)'  },
  'awaiting-verification':{ label: 'AWAITING VERIFICATION',color: '#9ad1ff', bg: 'rgba(154,209,255,0.10)', border: 'rgba(154,209,255,0.22)' },
}

const KIND_SORT_ORDER: Record<WorkQueueKind, number> = {
  'in-progress':           0,
  'awaiting-approval':     1,
  'approved-ready':        2,
  'remediation-pending':   3,
  'needs-remediation':     4,
  'awaiting-verification': 5,
}

// ── Derivation ────────────────────────────────────────────────────────────────

export function deriveWorkQueue(
  request: BuilderExecutionRequest | null,
  run:     BuilderExecutionRun     | null,
  history: BuilderExecutionHistorySnapshot,
): WorkQueueItem[] {
  const items: WorkQueueItem[] = []

  // ── 1. Active run → in-progress ──────────────────────────────────────────
  if (run && run.executionState === 'started') {
    items.push({
      id:               `run:${run.runId}`,
      kind:             'in-progress',
      summary:          run.summary || run.note || `Builder run ${run.runId} is in progress`,
      targetLabel:      run.target.targetLabel,
      targetId:         run.target.targetId,
      targetType:       run.target.targetType,
      recommendedAgent: 'kai',
      runId:            run.runId,
      requestId:        run.requestId,
      executionState:   run.executionState,
      remediationKind:  run.remediationKind,
      source:           run.source,
      note:             run.note,
      primaryTs:        run.startedAt,
      primaryTsLabel:   'started',
    })
  }

  // ── 2. Active request ────────────────────────────────────────────────────
  if (request) {
    const isRemediation = Boolean(request.remediationKind)

    if (request.approvalState === 'awaiting-approval') {
      items.push({
        id:               `req:${request.id}`,
        kind:             isRemediation ? 'remediation-pending' : 'awaiting-approval',
        summary:          request.planSummary,
        targetLabel:      request.target.targetLabel,
        targetId:         request.target.targetId,
        targetType:       request.target.targetType,
        recommendedAgent: 'kai',
        requestId:        request.id,
        sourceRunId:      request.sourceRunId,
        approvalState:    request.approvalState,
        remediationKind:  request.remediationKind,
        source:           request.source,
        note:             request.note,
        primaryTs:        request.requestedAt,
        primaryTsLabel:   'requested',
      })
    } else if (request.approvalState === 'approved' && !run) {
      items.push({
        id:               `req:${request.id}`,
        kind:             isRemediation ? 'remediation-pending' : 'approved-ready',
        summary:          request.planSummary,
        targetLabel:      request.target.targetLabel,
        targetId:         request.target.targetId,
        targetType:       request.target.targetType,
        recommendedAgent: 'kai',
        requestId:        request.id,
        sourceRunId:      request.sourceRunId,
        approvalState:    request.approvalState,
        remediationKind:  request.remediationKind,
        source:           request.source,
        note:             request.note,
        primaryTs:        request.settledAt ?? request.requestedAt,
        primaryTsLabel:   request.settledAt ? 'approved' : 'requested',
      })
    }
  }

  // ── 3. History-derived items ─────────────────────────────────────────────
  // Build the set of runIds that already have a remediation history entry so
  // we don't produce duplicate needs-remediation items.
  const remediatedRunIds = new Set<string>()
  for (const entry of history.entries) {
    if (entry.sourceRunId) remediatedRunIds.add(entry.sourceRunId)
  }

  for (const entry of history.entries) {
    // Skip the currently active in-memory run (already captured above)
    if (run && entry.runId === run.runId) continue

    const entryTs = entry.finishedAt || entry.startedAt || entry.createdAt

    // awaiting-verification: completed run with no checker decision yet
    if (
      entry.executionState === 'completed' &&
      !entry.verificationState
    ) {
      items.push({
        id:               `verify:${entry.runId}`,
        kind:             'awaiting-verification',
        summary:          entry.taskSummary || entry.summary || entry.note || `Finalized run ${entry.runId}`,
        targetLabel:      entry.target.targetLabel,
        targetId:         entry.target.targetId,
        targetType:       entry.target.targetType,
        recommendedAgent: 'maya',
        runId:            entry.runId,
        executionState:   entry.executionState,
        source:           'real-bridge',
        note:             entry.note,
        primaryTs:        entryTs,
        primaryTsLabel:   'finalized',
      })
    }

    // needs-remediation: failed/blocked with no existing remediation run and
    // not already covered by the active request
    if (
      (entry.executionState === 'failed' || entry.executionState === 'blocked') &&
      !remediatedRunIds.has(entry.runId) &&
      request?.sourceRunId !== entry.runId
    ) {
      items.push({
        id:               `remediate:${entry.runId}`,
        kind:             'needs-remediation',
        summary:          entry.taskSummary || entry.summary || entry.note || `${entry.executionState} run ${entry.runId}`,
        targetLabel:      entry.target.targetLabel,
        targetId:         entry.target.targetId,
        targetType:       entry.target.targetType,
        recommendedAgent: 'kai',
        runId:            entry.runId,
        executionState:   entry.executionState,
        source:           'real-bridge',
        note:             entry.note,
        primaryTs:        entryTs,
        primaryTsLabel:   'finished',
      })
    }
  }

  // ── Sort: by kind priority then by timestamp desc ────────────────────────
  return items.sort((a, b) => {
    const kindDiff = KIND_SORT_ORDER[a.kind] - KIND_SORT_ORDER[b.kind]
    if (kindDiff !== 0) return kindDiff
    return new Date(b.primaryTs).getTime() - new Date(a.primaryTs).getTime()
  })
}

// ── Filter ────────────────────────────────────────────────────────────────────

export function filterWorkQueue(
  items:        WorkQueueItem[],
  targetFilter: WorkQueueTargetFilter,
  kindFilter:   WorkQueueKind | 'all',
): WorkQueueItem[] {
  return items.filter((item) => {
    const targetOk =
      targetFilter === 'all' ||
      (targetFilter === 'app'     && item.targetType === 'app') ||
      (targetFilter === 'package' && (item.targetType === 'package' || item.targetId.startsWith('package/'))) ||
      (targetFilter === 'docs'    && (item.targetType === 'docs'    || item.targetId.startsWith('docs/'))) ||
      (targetFilter === 'repo'    && (item.targetType === 'repo'    || item.targetId === 'repo'))

    const kindOk = kindFilter === 'all' || item.kind === kindFilter

    return targetOk && kindOk
  })
}
