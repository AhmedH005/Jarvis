import { BUILDER_PLAN_SCOPE } from './builder-plan'
import type { BuilderExecutionRequest } from './builder-execution-request'
import type {
  BuilderWorkTarget,
  BuilderRemediationKind,
  BuilderExecutionHistoryEntry as BridgeBuilderExecutionHistoryEntry,
  BuilderExecutionHistoryQuery,
  BuilderExecutionHistoryResult,
  BuilderExecutionFinalizeInput,
  BuilderExecutionFinalizeResult,
  BuilderExecutionTerminalState,
  BuilderExecutionVerificationStatus,
  BuilderExecutionStartInput,
  BuilderExecutionStartResult,
} from '@/shared/builder-bridge'
import { normalizeBuilderWorkTarget } from '@/shared/builder-bridge'

export interface BuilderExecutionRun {
  runId: string
  requestId: string
  scope: string
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  target: BuilderWorkTarget
  executionState: 'started' | 'completed' | 'blocked' | 'failed'
  status: 'started' | 'completed' | 'blocked' | 'failed'
  source: 'real-bridge' | 'local-demo-fallback'
  sourceLabel: string
  startedAt: string
  finishedAt?: string
  summary: string
  filesChanged: string[]
  commandsRun: string[]
  verificationStatus: BuilderExecutionVerificationStatus
  verificationSummary?: string
  note: string
}

export interface BuilderExecutionSurface {
  available: boolean
  source: 'real-bridge' | 'local-demo-fallback'
  sourceLabel: string
  note: string
}

export interface BuilderExecutionHistoryEntry extends BridgeBuilderExecutionHistoryEntry {}

export interface BuilderExecutionHistorySnapshot {
  scope: string
  entries: BuilderExecutionHistoryEntry[]
  source: 'real-bridge' | 'local-demo-fallback'
  sourceLabel: string
  status: 'ok' | 'blocked'
  note: string
}

interface BuilderExecutionBridge {
  start?: (input: BuilderExecutionStartInput) => Promise<BuilderExecutionStartResult>
  finalize?: (input: BuilderExecutionFinalizeInput) => Promise<BuilderExecutionFinalizeResult>
  listHistory?: (query: BuilderExecutionHistoryQuery) => Promise<BuilderExecutionHistoryResult>
}

function getBuilderExecutionBridge(): BuilderExecutionBridge | null {
  const jarvis = window.jarvis as (typeof window.jarvis & {
    builderExecution?: BuilderExecutionBridge
  }) | undefined

  if (jarvis?.builderExecution) {
    return jarvis.builderExecution
  }

  return null
}

export function resolveBuilderExecutionSurface(): BuilderExecutionSurface {
  const bridge = getBuilderExecutionBridge()
  if (
    bridge &&
    typeof bridge.start === 'function' &&
    typeof bridge.finalize === 'function' &&
    typeof bridge.listHistory === 'function'
  ) {
    return {
      available: true,
      source: 'real-bridge',
      sourceLabel: 'real bridge',
      note: 'Execution start, terminal result finalization, and canonical Builder history reads are currently being served by a live local Builder bridge. Streaming and Checker verification still happen later.',
    }
  }

  return {
    available: false,
    source: 'local-demo-fallback',
    sourceLabel: 'unavailable',
    note: 'Builder execution bridge is not available. Open Jarvis in Electron to use the real execution bridge.',
  }
}

function normalizeBridgeExecutionStart(result: BuilderExecutionStartResult): BuilderExecutionRun {
  return {
    runId: result.runId,
    requestId: result.requestId,
    scope: result.scope,
    sourceRunId: result.sourceRunId,
    remediationKind: result.remediationKind,
    target: normalizeBuilderWorkTarget(result.target),
    executionState: result.executionState,
    status: result.status,
    source: 'real-bridge',
    sourceLabel: result.sourceLabel || 'real bridge',
    startedAt: result.startedAt || new Date().toISOString(),
    summary: '',
    filesChanged: [],
    commandsRun: [],
    verificationStatus: 'not-run',
    note: result.note,
  }
}

function normalizeBridgeExecutionFinalize(result: BuilderExecutionFinalizeResult): BuilderExecutionRun {
  return {
    runId: result.runId,
    requestId: result.requestId,
    scope: result.scope,
    sourceRunId: result.sourceRunId,
    remediationKind: result.remediationKind,
    target: normalizeBuilderWorkTarget(result.target),
    executionState: result.executionState,
    status: result.status,
    source: 'real-bridge',
    sourceLabel: result.sourceLabel || 'real bridge',
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    summary: result.summary,
    filesChanged: result.filesChanged ?? [],
    commandsRun: result.commandsRun ?? [],
    verificationStatus: result.verificationStatus,
    verificationSummary: result.verificationSummary,
    note: result.note,
  }
}

export async function startBuilderExecution(request: BuilderExecutionRequest): Promise<BuilderExecutionRun> {
  const bridge = getBuilderExecutionBridge()
  if (!bridge || typeof bridge.start !== 'function') {
    throw new Error(
      'Builder execution bridge is not available. Open Jarvis in Electron to start a real run.'
    )
  }

  const result = await bridge.start({
    requestId: request.id,
    scope: BUILDER_PLAN_SCOPE,
    mode: 'approved execution start',
  })

  return normalizeBridgeExecutionStart(result)
}

export interface BuilderExecutionFinalizeDraft {
  outcome: BuilderExecutionTerminalState
  summary: string
  filesChanged?: string[]
  commandsRun?: string[]
  verificationStatus: BuilderExecutionVerificationStatus
  verificationSummary?: string
}

export async function finalizeBuilderExecution(
  run: BuilderExecutionRun,
  draft: BuilderExecutionFinalizeDraft
): Promise<BuilderExecutionRun> {
  const bridge = getBuilderExecutionBridge()
  if (!bridge || typeof bridge.finalize !== 'function') {
    throw new Error(
      'Builder execution bridge is not available. Open Jarvis in Electron to finalize a run.'
    )
  }

  const result = await bridge.finalize({
    runId: run.runId,
    scope: BUILDER_PLAN_SCOPE,
    outcome: draft.outcome,
    summary: draft.summary,
    filesChanged: draft.filesChanged,
    commandsRun: draft.commandsRun,
    verificationStatus: draft.verificationStatus,
    verificationSummary: draft.verificationSummary,
  })

  return normalizeBridgeExecutionFinalize(result)
}

function normalizeBridgeExecutionHistory(
  result: BuilderExecutionHistoryResult
): BuilderExecutionHistorySnapshot {
  return {
    scope: result.scope,
    entries: result.entries.map((entry) => ({
      ...entry,
      target: normalizeBuilderWorkTarget(entry.target, entry.likelyFiles),
      likelyFiles: entry.likelyFiles ?? [],
      filesChanged: entry.filesChanged ?? [],
      commandsRun: entry.commandsRun ?? [],
      verificationStatus: entry.verificationStatus ?? 'not-run',
      builderVerificationSummary: entry.builderVerificationSummary,
      checkedAt: entry.checkedAt,
      verificationState: entry.verificationState,
      verificationSummary: entry.verificationSummary,
    })),
    source: 'real-bridge',
    sourceLabel: result.sourceLabel || 'real bridge',
    status: result.status,
    note: result.note,
  }
}

export async function loadBuilderExecutionHistory(): Promise<BuilderExecutionHistorySnapshot> {
  const bridge = getBuilderExecutionBridge()
  if (bridge && typeof bridge.listHistory === 'function') {
    try {
      return normalizeBridgeExecutionHistory(await bridge.listHistory({ scope: BUILDER_PLAN_SCOPE }))
    } catch (err) {
      console.error('[JARVIS] loadBuilderExecutionHistory IPC failed:', err)
      return {
        scope: BUILDER_PLAN_SCOPE,
        entries: [],
        source: 'local-demo-fallback',
        sourceLabel: 'ipc-error',
        status: 'blocked',
        note: `Builder execution history IPC call failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  return {
    scope: BUILDER_PLAN_SCOPE,
    entries: [],
    source: 'local-demo-fallback',
    sourceLabel: 'no-bridge',
    status: 'blocked',
    note: 'Builder execution bridge is not available. Open Jarvis in Electron to load real run history.',
  }
}
