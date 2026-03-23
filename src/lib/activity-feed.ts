import type { AgentPersonaId } from '@/adapters/agent-control'
import type { BuilderExecutionRequest } from '@/adapters/builder-execution-request'
import type { BuilderExecutionRun, BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import type { MissionHandoff } from '@/store/mission-handoff'

// ── Event model ───────────────────────────────────────────────────────────────

export type ActivityEventKind =
  | 'mission-handoff'
  | 'request-created'
  | 'request-approved'
  | 'request-denied'
  | 'run-started'
  | 'run-finalized'
  | 'verification-added'
  | 'remediation-created'

export type ActivityEventFilter = 'all' | 'builder' | 'checker' | 'handoff' | 'remediation'

export interface ActivityEvent {
  id:           string
  kind:         ActivityEventKind
  agentId?:     AgentPersonaId
  agentName?:   string
  target?:      string
  requestId?:   string
  runId?:       string
  sourceRunId?: string
  summary:      string
  createdAt:    string
  source:       'real-bridge' | 'local-demo-fallback' | 'derived'
  note?:        string
}

// ── Kind metadata ─────────────────────────────────────────────────────────────

export const EVENT_KIND_META: Record<ActivityEventKind, {
  label:  string
  color:  string
  bg:     string
  border: string
}> = {
  'mission-handoff':     { label: 'HANDOFF',       color: '#9ad1ff', bg: 'rgba(154,209,255,0.10)', border: 'rgba(154,209,255,0.22)' },
  'request-created':     { label: 'REQUEST',        color: '#ffc84a', bg: 'rgba(255,200,74,0.10)',  border: 'rgba(255,200,74,0.22)'  },
  'request-approved':    { label: 'APPROVED',       color: '#00ff88', bg: 'rgba(0,255,136,0.10)',   border: 'rgba(0,255,136,0.22)'   },
  'request-denied':      { label: 'DENIED',         color: '#ff6b35', bg: 'rgba(255,107,53,0.10)',  border: 'rgba(255,107,53,0.22)'  },
  'run-started':         { label: 'RUN STARTED',    color: '#00d4ff', bg: 'rgba(0,212,255,0.10)',   border: 'rgba(0,212,255,0.22)'   },
  'run-finalized':       { label: 'RUN FINALIZED',  color: '#c0e8f0', bg: 'rgba(192,232,240,0.08)', border: 'rgba(192,232,240,0.18)' },
  'verification-added':  { label: 'VERIFIED',       color: '#00ff88', bg: 'rgba(0,255,136,0.10)',   border: 'rgba(0,255,136,0.22)'   },
  'remediation-created': { label: 'REMEDIATION',    color: '#ffb86b', bg: 'rgba(255,184,107,0.10)', border: 'rgba(255,184,107,0.22)' },
}

// ── Filter mapping ────────────────────────────────────────────────────────────

const FILTER_KINDS: Record<ActivityEventFilter, ActivityEventKind[] | null> = {
  'all':         null,
  'builder':     ['request-created', 'request-approved', 'request-denied', 'run-started', 'run-finalized'],
  'checker':     ['verification-added'],
  'handoff':     ['mission-handoff'],
  'remediation': ['remediation-created'],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

// ── Derivation ────────────────────────────────────────────────────────────────

/**
 * Derive a structured activity event list from existing real workflow state.
 * Events are sorted newest-first. No events are fabricated — every entry must
 * correspond to a real state transition in the Builder/Checker pipeline.
 *
 * Graceful: any derivation error is swallowed and the function returns
 * whatever was accumulated before the failure.
 */
export function deriveActivityFeed(
  handoff: MissionHandoff | null,
  request: BuilderExecutionRequest | null,
  run:     BuilderExecutionRun | null,
  history: BuilderExecutionHistorySnapshot,
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  try {
    // ── Mission handoff (Command Center → Agents) ─────────────────────────
    if (handoff) {
      events.push({
        id:        `handoff:${handoff.createdAt}`,
        kind:      'mission-handoff',
        agentId:   handoff.agentId,
        agentName: handoff.agentName,
        target:    handoff.targetHint ?? handoff.targetId ?? undefined,
        summary:   truncate(handoff.missionText, 120),
        createdAt: handoff.createdAt,
        source:    'derived',
        note:      `Routed to ${handoff.agentName} via Command Center`,
      })
    }

    // ── Active execution request ──────────────────────────────────────────
    if (request) {
      events.push({
        id:        `req-created:${request.id}`,
        kind:      'request-created',
        agentId:   'kai',
        agentName: 'Kai',
        target:    request.target.targetLabel,
        requestId: request.id,
        summary:   truncate(request.planSummary, 120),
        createdAt: request.requestedAt,
        source:    request.source,
        note:      request.note,
      })

      if (request.approvalState === 'approved' && request.settledAt) {
        events.push({
          id:        `req-approved:${request.id}`,
          kind:      'request-approved',
          agentId:   'kai',
          agentName: 'Kai',
          target:    request.target.targetLabel,
          requestId: request.id,
          summary:   `Approved: ${truncate(request.planSummary, 90)}`,
          createdAt: request.settledAt,
          source:    request.source,
        })
      } else if (request.approvalState === 'denied' && request.settledAt) {
        events.push({
          id:        `req-denied:${request.id}`,
          kind:      'request-denied',
          agentId:   'kai',
          agentName: 'Kai',
          target:    request.target.targetLabel,
          requestId: request.id,
          summary:   `Denied: ${truncate(request.planSummary, 90)}`,
          createdAt: request.settledAt,
          source:    request.source,
        })
      }
    }

    // ── Active run ────────────────────────────────────────────────────────
    if (run) {
      events.push({
        id:        `run-started:${run.runId}`,
        kind:      'run-started',
        agentId:   'kai',
        agentName: 'Kai',
        target:    run.target.targetLabel,
        runId:     run.runId,
        requestId: run.requestId,
        summary:   run.summary || `Builder run ${run.runId} in progress`,
        createdAt: run.startedAt,
        source:    run.source,
        note:      run.note,
      })

      if (run.executionState !== 'started' && run.finishedAt) {
        events.push({
          id:        `run-finalized:${run.runId}`,
          kind:      'run-finalized',
          agentId:   'kai',
          agentName: 'Kai',
          target:    run.target.targetLabel,
          runId:     run.runId,
          requestId: run.requestId,
          summary:   run.summary || `Run finished — ${run.executionState}`,
          createdAt: run.finishedAt,
          source:    run.source,
        })
      }
    }

    // ── History entries ───────────────────────────────────────────────────
    for (const entry of history.entries) {
      // Skip any entry already captured via the in-memory run
      if (run && entry.runId === run.runId) continue

      const entryFinished = entry.finishedAt || entry.startedAt || entry.createdAt
      const entryStarted  = entry.startedAt  || entry.createdAt

      // run-finalized
      if (
        entry.executionState === 'completed' ||
        entry.executionState === 'failed'    ||
        entry.executionState === 'blocked'
      ) {
        events.push({
          id:        `hist-finalized:${entry.runId}`,
          kind:      'run-finalized',
          agentId:   'kai',
          agentName: 'Kai',
          target:    entry.target.targetLabel,
          runId:     entry.runId,
          summary:   truncate(entry.taskSummary || entry.summary || `Run ${entry.runId}: ${entry.executionState}`, 120),
          createdAt: entryFinished,
          source:    'real-bridge',
          note:      entry.note,
        })
      }

      // verification-added — only when checker produced a real decision
      if (entry.verificationState && entry.checkedAt) {
        events.push({
          id:        `verify:${entry.runId}`,
          kind:      'verification-added',
          agentId:   'maya',
          agentName: 'Maya',
          target:    entry.target.targetLabel,
          runId:     entry.runId,
          summary:   truncate(
            entry.verificationSummary ||
            entry.builderVerificationSummary ||
            `Checker: ${entry.verificationState} for run ${entry.runId}`,
            120,
          ),
          createdAt: entry.checkedAt,
          source:    'real-bridge',
        })
      }

      // remediation-created — history entry that is itself a remediation run
      if (entry.sourceRunId) {
        events.push({
          id:          `remediate:${entry.runId}`,
          kind:        'remediation-created',
          agentId:     'kai',
          agentName:   'Kai',
          target:      entry.target.targetLabel,
          runId:       entry.runId,
          sourceRunId: entry.sourceRunId,
          summary:     truncate(
            entry.taskSummary || `Remediation for run ${entry.sourceRunId}`,
            120,
          ),
          createdAt: entryStarted,
          source:    'real-bridge',
        })
      }
    }
  } catch {
    // Graceful degradation: return whatever was accumulated before the error
  }

  // Newest first; guard against unparseable timestamps
  return events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    if (isNaN(ta) || isNaN(tb)) return 0
    return tb - ta
  })
}

// ── Filter ────────────────────────────────────────────────────────────────────

export function filterActivityFeed(
  events: ActivityEvent[],
  filter: ActivityEventFilter,
): ActivityEvent[] {
  const allowed = FILTER_KINDS[filter]
  if (!allowed) return events
  return events.filter((e) => allowed.includes(e.kind))
}
