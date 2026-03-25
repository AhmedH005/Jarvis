import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  BUILDER_REPO_SCOPE,
  buildBuilderRepoTarget,
  type BuilderExecutionHistoryEntry,
  type BuilderExecutionHistoryQuery,
  type BuilderExecutionHistoryResult,
  type BuilderExecutionFinalizeInput,
  type BuilderExecutionFinalizeResult,
  type BuilderExecutionRemediationRequestInput,
  type BuilderExecutionRemediationRequestResult,
  type BuilderExecutionRequestCreateInput,
  type BuilderExecutionRequestCreateResult,
  type BuilderExecutionRequestRecord,
  type BuilderExecutionRunRecord,
  type BuilderRemediationKind,
  type BuilderExecutionStartInput,
  type BuilderExecutionStartResult,
  type BuilderExecutionRequestSettleInput,
  type BuilderExecutionRequestSettleResult,
  type BuilderWorkTarget,
  type BuilderPlanBridgeRequest,
  type BuilderPlanBridgeResult,
  type CheckerVerifyRunInput,
  type CheckerVerifyRunResult,
  normalizeBuilderWorkTarget,
} from '../src/shared/builder-bridge'
import type { OpenClawBridge } from './openclaw'

const planRecords = new Map<string, BuilderPlanBridgeResult>()
const REQUEST_STORE_VERSION = 1
const RUN_STORE_VERSION = 1
let runUpdateNotifier: ((runId: string) => void) | null = null

export function setBuilderRunUpdateNotifier(notify: ((runId: string) => void) | null): void {
  runUpdateNotifier = notify
}

interface BuilderExecutionRequestStoreFile {
  version: number
  requests: Record<string, BuilderExecutionRequestRecord>
}

interface BuilderExecutionRunStoreFile {
  version: number
  runs: Record<string, BuilderExecutionRunRecord>
}

function createRecordId(prefix: 'bp' | 'ber' | 'brun'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim()
}

function includesAny(prompt: string, words: string[]): boolean {
  return words.some((word) => prompt.includes(word))
}

function getRequestStorePath(): string {
  return path.join(app.getPath('userData'), 'builder-execution-requests.json')
}

function getRunStorePath(): string {
  return path.join(app.getPath('userData'), 'builder-execution-runs.json')
}

function readRequestStore(): BuilderExecutionRequestStoreFile {
  try {
    const raw = fs.readFileSync(getRequestStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<BuilderExecutionRequestStoreFile>
    if (parsed.version === REQUEST_STORE_VERSION && parsed.requests && typeof parsed.requests === 'object') {
      return {
        version: REQUEST_STORE_VERSION,
        requests: parsed.requests as Record<string, BuilderExecutionRequestRecord>,
      }
    }
  } catch {}

  return {
    version: REQUEST_STORE_VERSION,
    requests: {},
  }
}

function writeRequestStore(store: BuilderExecutionRequestStoreFile): void {
  const filePath = getRequestStorePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function readRunStore(): BuilderExecutionRunStoreFile {
  try {
    const raw = fs.readFileSync(getRunStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<BuilderExecutionRunStoreFile>
    if (parsed.version === RUN_STORE_VERSION && parsed.runs && typeof parsed.runs === 'object') {
      const sanitizedRuns = Object.fromEntries(
        Object.entries(parsed.runs as Record<string, BuilderExecutionRunRecord>).map(([runId, run]) => [
          runId,
          sanitizeStoredRunRecord(run),
        ])
      )
      const mutated = JSON.stringify(sanitizedRuns) !== JSON.stringify(parsed.runs)
      const store = {
        version: RUN_STORE_VERSION,
        runs: sanitizedRuns,
      }
      if (mutated) {
        writeRunStore(store)
      }
      return {
        version: RUN_STORE_VERSION,
        runs: sanitizedRuns,
      }
    }
  } catch {}

  return {
    version: RUN_STORE_VERSION,
    runs: {},
  }
}

function writeRunStore(store: BuilderExecutionRunStoreFile): void {
  const filePath = getRunStorePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function saveRequestRecord(record: BuilderExecutionRequestRecord): BuilderExecutionRequestRecord {
  const store = readRequestStore()
  store.requests[record.requestId] = record
  writeRequestStore(store)
  return record
}

function getRequestRecord(requestId: string): BuilderExecutionRequestRecord | null {
  const normalizedId = normalizePrompt(requestId)
  if (!normalizedId) return null
  return readRequestStore().requests[normalizedId] ?? null
}

function findRequestRecordBySourceRunId(sourceRunId: string): BuilderExecutionRequestRecord | null {
  const normalizedId = normalizePrompt(sourceRunId)
  if (!normalizedId) return null

  const requests = Object.values(readRequestStore().requests)
  return requests.find((request) => request.sourceRunId === normalizedId) ?? null
}

function saveRunRecord(record: BuilderExecutionRunRecord): BuilderExecutionRunRecord {
  const store = readRunStore()
  store.runs[record.runId] = record
  writeRunStore(store)
  runUpdateNotifier?.(record.runId)
  return record
}

function getRunRecord(runId: string): BuilderExecutionRunRecord | null {
  const normalizedId = normalizePrompt(runId)
  if (!normalizedId) return null
  return readRunStore().runs[normalizedId] ?? null
}

function getRunRecordForRequest(requestId: string): BuilderExecutionRunRecord | null {
  const normalizedId = normalizePrompt(requestId)
  if (!normalizedId) return null

  const runs = Object.values(readRunStore().runs)
  return runs.find((run) => run.requestId === normalizedId) ?? null
}

function normalizeStringList(values: unknown, maxItems = 20): string[] {
  if (!Array.isArray(values)) return []

  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = normalizePrompt(value)
    if (!normalized || out.includes(normalized)) continue
    out.push(normalized)
    if (out.length >= maxItems) break
  }

  return out
}

function normalizeReportedFiles(values: unknown): { ok: boolean; files: string[] } {
  if (!Array.isArray(values)) {
    return {
      ok: true,
      files: [],
    }
  }

  const files: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue

    const normalized = normalizePrompt(value).replace(/\\/g, '/')
    if (!normalized) continue

    if (path.isAbsolute(normalized)) {
      if (normalized === BUILDER_REPO_SCOPE) continue
      if (!normalized.startsWith(`${BUILDER_REPO_SCOPE}/`)) {
        return { ok: false, files: [] }
      }

      const relative = normalizePrompt(path.relative(BUILDER_REPO_SCOPE, normalized).replace(/\\/g, '/'))
      if (!relative || relative.startsWith('..')) {
        return { ok: false, files: [] }
      }

      if (!files.includes(relative)) files.push(relative)
      continue
    }

    const relative = path.posix.normalize(normalized)
    if (
      relative === '.' ||
      relative === '..' ||
      relative.startsWith('../') ||
      relative.includes('/../')
    ) {
      return { ok: false, files: [] }
    }

    if (!files.includes(relative)) files.push(relative)
  }

  return {
    ok: true,
    files: files.slice(0, 25),
  }
}

function resolveWorkTarget(
  target: Partial<BuilderWorkTarget> | null | undefined,
  fallbackPaths: unknown
): BuilderWorkTarget {
  const normalizedPaths = normalizeReportedFiles(fallbackPaths)
  return normalizeBuilderWorkTarget(target, normalizedPaths.ok ? normalizedPaths.files : [])
}

function isStoredRequestMalformed(request: BuilderExecutionRequestRecord): boolean {
  return (
    !normalizePrompt(request.requestId) ||
    request.scope !== BUILDER_REPO_SCOPE ||
    !normalizePrompt(request.summary) ||
    !normalizePrompt(request.createdAt)
  )
}

function isStoredRunMalformed(run: BuilderExecutionRunRecord): boolean {
  return (
    !normalizePrompt(run.runId) ||
    !normalizePrompt(run.requestId) ||
    run.scope !== BUILDER_REPO_SCOPE ||
    !normalizePrompt(run.startedAt)
  )
}

function resolveHistoryTimestamp(entry: BuilderExecutionHistoryEntry): number {
  const timestamp = entry.finishedAt || entry.startedAt || entry.settledAt || entry.createdAt
  const parsed = timestamp ? new Date(timestamp).getTime() : NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

function deriveLikelyFiles(prompt: string): string[] {
  const out: string[] = []

  const add = (...files: string[]) => {
    for (const file of files) {
      if (!out.includes(file)) out.push(file)
    }
  }

  if (includesAny(prompt, ['builder', 'bridge', 'ipc', 'preload', 'electron'])) {
    add(
      'electron/preload.ts',
      'electron/main.ts',
      'electron/builder-bridge.ts',
      'src/adapters/builder-plan.ts',
      'src/adapters/builder-execution-request.ts'
    )
  }

  if (includesAny(prompt, ['agent', 'agents', 'builder card', 'agents tab'])) {
    add(
      'src/components/tabs/AgentsTab.tsx',
      'src/components/tabs/BuilderPlanPanel.tsx',
      'src/adapters/agent-operations.ts'
    )
  }

  if (includesAny(prompt, ['approval', 'execution request', 'request record'])) {
    add(
      'src/adapters/builder-execution-request.ts',
      'src/store/builder-execution-request.ts',
      'src/components/tabs/BuilderPlanPanel.tsx'
    )
  }

  if (includesAny(prompt, ['plan', 'planning', 'task summary', 'scope'])) {
    add(
      'src/adapters/builder-plan.ts',
      'src/store/builder-plan.ts',
      'src/components/tabs/BuilderPlanPanel.tsx'
    )
  }

  if (includesAny(prompt, ['types', 'contract', 'window.jarvis'])) {
    add(
      'src/shared/builder-bridge.ts',
      'src/lib/utils.ts',
      'electron/preload.ts'
    )
  }

  return out.slice(0, 5)
}

function deriveAcceptanceCriteria(taskPrompt: string): string[] {
  const out = [
    `The task "${taskPrompt}" remains scoped to ${BUILDER_REPO_SCOPE}.`,
    'The bridge returns a real plan record with summary, likely files, acceptance criteria, and verification guidance.',
    'The response does not imply code execution, approval settlement, file mutation, or verification already happened.',
  ]

  if (includesAny(taskPrompt, ['ui', 'panel', 'card', 'tab', 'surface'])) {
    out.splice(1, 0, 'The UI continues to present Builder planning and request creation as bounded, approval-gated surfaces.')
  }

  return out
}

function deriveVerificationPath(taskPrompt: string): string[] {
  const out = [
    'Inspect the scoped files before any later implementation pass.',
    'Run `npm run typecheck` after a real approved Builder implementation run.',
    'Run `npm run build` and manually verify the affected Jarvis surface before closing the task.',
  ]

  if (includesAny(taskPrompt, ['ui', 'panel', 'card', 'tab', 'surface'])) {
    out.splice(1, 0, 'Open the affected Builder card flow in the Jarvis shell and confirm the truth labels still match backend reality.')
  }

  return out.slice(0, 4)
}

function buildTaskSummary(taskPrompt: string): string {
  return `Scope a plan-only Builder task for "${taskPrompt}" inside ${BUILDER_REPO_SCOPE}, returning a truthful plan record without starting execution.`
}

function parseAgentCompletion(text: string): {
  outcome: 'completed' | 'failed' | 'blocked'
  summary: string
  filesChanged: string[]
  commandsRun: string[]
  verificationStatus: 'passed' | 'failed' | 'not-run'
  verificationSummary?: string
} | null {
  const match = text.match(/===JARVIS_RESULT===\s*([\s\S]*?)\s*===JARVIS_RESULT_END===/)
  if (!match) return null

  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>
    const outcome = raw.outcome === 'completed' || raw.outcome === 'failed' || raw.outcome === 'blocked'
      ? raw.outcome
      : 'completed'
    const summary = typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim()
      : 'Builder run completed.'
    const filesChanged = normalizeReportedFiles(raw.filesChanged).ok
      ? normalizeReportedFiles(raw.filesChanged).files
      : []
    const commandsRun = normalizeStringList(raw.commandsRun, 25)
    const verificationStatus = raw.verificationStatus === 'passed' || raw.verificationStatus === 'failed'
      ? raw.verificationStatus
      : 'not-run'
    const verificationSummary = typeof raw.verificationSummary === 'string' && raw.verificationSummary.trim()
      ? raw.verificationSummary.trim()
      : undefined

    return { outcome, summary, filesChanged, commandsRun, verificationStatus, verificationSummary }
  } catch {
    return null
  }
}

function hasValidationEvidence(commandsRun: string[]): boolean {
  return commandsRun.some((command) =>
    /\b(typecheck|build|test|vitest|jest|playwright|cypress|lint)\b/i.test(command)
  )
}

function getCompletionContractIssues(
  outcome: 'completed' | 'failed' | 'blocked',
  filesChanged: string[],
  commandsRun: string[],
  verificationStatus: 'passed' | 'failed' | 'not-run'
): string[] {
  if (outcome !== 'completed') return []

  const issues: string[] = []
  if (filesChanged.length === 0) {
    issues.push('completed outcome was reported without any recorded file edits')
  }
  if (commandsRun.length === 0) {
    issues.push('completed outcome was reported without any recorded validation commands')
  } else if (!hasValidationEvidence(commandsRun)) {
    issues.push('completed outcome was reported without a recognizable validation command')
  }
  if (verificationStatus === 'not-run') {
    issues.push('completed outcome was reported with verificationStatus "not-run"')
  }

  return issues
}

function sanitizeStoredRunRecord(run: BuilderExecutionRunRecord): BuilderExecutionRunRecord {
  if (run.executionState !== 'completed') return run

  const filesChanged = normalizeReportedFiles(run.filesChanged).ok ? normalizeReportedFiles(run.filesChanged).files : []
  const commandsRun = normalizeStringList(run.commandsRun, 25)
  const verificationStatus = run.verificationStatus ?? 'not-run'
  const issues = getCompletionContractIssues('completed', filesChanged, commandsRun, verificationStatus)
  if (issues.length === 0) return run

  return {
    ...run,
    executionState: 'failed',
    summary: `Builder run violated the completion contract: ${issues.join('; ')}.`,
    filesChanged,
    commandsRun,
    verificationStatus: 'failed',
    verificationSummary: run.verificationSummary || 'This stored run was downgraded because it did not include grounded completion evidence.',
    note: `${run.note} Stored run was downgraded to failed because it claimed completion without the required edit/validation evidence.`,
  }
}

const finalizingRuns = new Set<string>()

function autoFinalizeRun(runId: string, text: string, completionState: 'final' | 'aborted' | 'error'): void {
  if (finalizingRuns.has(runId)) return
  finalizingRuns.add(runId)
  void autoFinalizeRunAsync(runId, text, completionState).finally(() => {
    finalizingRuns.delete(runId)
  })
}

async function autoFinalizeRunAsync(
  runId: string,
  text: string,
  completionState: 'final' | 'aborted' | 'error'
): Promise<void> {
  const existing = getRunRecord(runId)
  if (!existing || existing.executionState !== 'started') return

  const finishedAt = new Date().toISOString()
  if (completionState !== 'final') {
    saveRunRecord({
      ...existing,
      executionState: 'failed',
      finishedAt,
      summary: completionState === 'aborted' ? 'Builder run was aborted.' : 'Builder run encountered an error.',
      filesChanged: [],
      commandsRun: [],
      verificationStatus: 'failed',
      verificationSummary: completionState === 'aborted'
        ? 'The detached Builder run was aborted before it produced a grounded completion report.'
        : 'The detached Builder run ended with an error before it produced a grounded completion report.',
      note: `${existing.note} Auto-finalized as failed (${completionState}).`,
    })
    return
  }

  const parsed = parseAgentCompletion(text)
  const fallbackSummary = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' ')
    .slice(0, 300) || 'Builder run completed.'

  if (!parsed) {
    saveRunRecord({
      ...existing,
      executionState: 'failed',
      finishedAt,
      summary: 'Builder run ended without the required structured completion report.',
      filesChanged: [],
      commandsRun: [],
      verificationStatus: 'failed',
      verificationSummary: `The Builder run did not emit the mandatory JARVIS_RESULT block. Last visible summary: ${fallbackSummary}`,
      note: `${existing.note} Auto-finalized as failed because the structured completion report was missing.`,
    })
    return
  }

  const issues = getCompletionContractIssues(
    parsed.outcome,
    parsed.filesChanged,
    parsed.commandsRun,
    parsed.verificationStatus
  )

  if (issues.length > 0) {
    saveRunRecord({
      ...existing,
      executionState: 'failed',
      finishedAt,
      summary: `Builder run violated the completion contract: ${issues.join('; ')}.`,
      filesChanged: parsed.filesChanged,
      commandsRun: parsed.commandsRun,
      verificationStatus: 'failed',
      verificationSummary: parsed.verificationSummary || 'The Builder run did not provide the required grounded completion evidence.',
      note: `${existing.note} Auto-finalized as failed because the structured completion report did not satisfy the Builder contract.`,
    })
    return
  }

  saveRunRecord({
    ...existing,
    executionState: parsed.outcome,
    finishedAt,
    summary: parsed.summary,
    filesChanged: parsed.filesChanged,
    commandsRun: parsed.commandsRun,
    verificationStatus: parsed.verificationStatus,
    verificationSummary: parsed.verificationSummary,
    note: `${existing.note} Auto-finalized from agent completion report.`,
  })
}

function buildExecutionRequestSummary(taskSummary: string): string {
  return `Approval-gated request to implement the scoped Builder plan: ${taskSummary}`
}

function buildRemediationSummary(
  sourceRunId: string,
  remediationPrompt: string,
  remediationKind: BuilderRemediationKind
): string {
  return `Approval-gated ${remediationKind} follow-up to run ${sourceRunId}: ${remediationPrompt}`
}

function deriveRemediationKind(): BuilderRemediationKind {
  return 'fix-forward'
}

function deriveRemediationLikelyFiles(
  sourceRun: BuilderExecutionRunRecord,
  sourceRequest: BuilderExecutionRequestRecord | null
): string[] {
  const merged = normalizeReportedFiles([
    ...(sourceRequest?.likelyFiles ?? []),
    ...(sourceRun.filesChanged ?? []),
  ])

  return merged.ok ? merged.files.slice(0, 5) : []
}

function buildExecutionStartPrompt(request: BuilderExecutionRequestRecord, runId: string): string {
  const likelyFiles = request.likelyFiles.length > 0
    ? `Likely files/work area: ${request.likelyFiles.join(', ')}.`
    : 'Likely files/work area were not scoped tightly enough to list honestly yet.'
  const target = resolveWorkTarget(request.target, request.likelyFiles)

  return [
    'Builder Agent execution start.',
    `Repo root: ${BUILDER_REPO_SCOPE}.`,
    `Run id: ${runId}.`,
    `Approved request id: ${request.requestId}.`,
    `Approved task summary: ${request.summary}.`,
    `Work target: ${target.targetLabel}.`,
    `Target paths: ${target.targetPaths.join(', ')}.`,
    likelyFiles,
    'Approval state: approved.',
    `Allowed scope: inspect and modify files only inside ${BUILDER_REPO_SCOPE}.`,
    'Allowed verification: repo-local checks only when relevant to the scoped task.',
    'Disallowed: scope expansion, destructive operations, dependency installs, external changes, secrets handling, machine-wide mutation, or implied Checker flow.',
    'Default workflow: INSPECT -> EDIT -> VALIDATE -> FIX -> REPORT.',
    'Do not stop at planning notes, execution requests, handoff prompts, or "next I would..." summaries.',
    'For outcome "completed", you must have actually edited files and run real validation commands.',
    'If unrelated repo debt blocks validation, explain that exactly in verificationSummary instead of pretending success.',
    'When all work is done, output this JSON block as the very last thing you write:',
    '===JARVIS_RESULT===',
    '{"outcome":"completed","summary":"what was implemented","filesChanged":["relative/path"],"commandsRun":["npm run typecheck"],"verificationStatus":"passed","verificationSummary":"exact validation result"}',
    '===JARVIS_RESULT_END===',
  ].join('\n')
}

function buildBlockedPlanResult(taskPrompt: string, note: string): BuilderPlanBridgeResult {
  const createdAt = new Date().toISOString()

  return {
    id: createRecordId('bp'),
    taskPrompt,
    scope: BUILDER_REPO_SCOPE,
    mode: 'plan-only',
    taskSummary: 'The Builder bridge could not scope this plan request truthfully.',
    target: buildBuilderRepoTarget(),
    likelyFiles: [],
    acceptanceCriteria: [
      'Provide a clearer task prompt tied to a concrete Jarvis repo outcome.',
      `Keep the request exactly scoped to ${BUILDER_REPO_SCOPE}.`,
    ],
    verificationPath: [
      'Clarify the desired repo change before attempting implementation planning.',
    ],
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    status: 'blocked',
    note,
    createdAt,
  }
}

function buildBlockedExecutionRequest(note: string): BuilderExecutionRequestCreateResult {
  return {
    requestId: createRecordId('ber'),
    approvalState: 'blocked',
    scope: BUILDER_REPO_SCOPE,
    summary: 'The Builder bridge could not package this execution request truthfully.',
    target: buildBuilderRepoTarget(),
    likelyFiles: [],
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    status: 'blocked',
    createdAt: new Date().toISOString(),
    note,
  }
}

function buildBlockedRemediationRequest(
  sourceRunId: string,
  note: string,
  target: Partial<BuilderWorkTarget> | null | undefined = null
): BuilderExecutionRemediationRequestResult {
  const normalizedSourceRunId = normalizePrompt(sourceRunId)

  return {
    requestId: createRecordId('ber'),
    sourceRunId: normalizedSourceRunId || createRecordId('brun'),
    remediationKind: 'fix-forward',
    scope: BUILDER_REPO_SCOPE,
    approvalState: 'blocked',
    status: 'blocked',
    summary: 'The Builder bridge could not package this remediation request truthfully.',
    likelyFiles: [],
    target: normalizeBuilderWorkTarget(target, []),
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    createdAt: new Date().toISOString(),
    note,
  }
}

function buildBlockedSettlementResult(requestId: string, note: string): BuilderExecutionRequestSettleResult {
  return {
    requestId: normalizePrompt(requestId) || createRecordId('ber'),
    scope: BUILDER_REPO_SCOPE,
    approvalState: 'blocked',
    status: 'blocked',
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    settledAt: new Date().toISOString(),
    note,
  }
}

function buildBlockedExecutionStartResult(
  requestId: string,
  note: string,
  target: Partial<BuilderWorkTarget> | null | undefined = null
): BuilderExecutionStartResult {
  return {
    runId: createRecordId('brun'),
    requestId: normalizePrompt(requestId) || createRecordId('ber'),
    scope: BUILDER_REPO_SCOPE,
    target: normalizeBuilderWorkTarget(target, []),
    executionState: 'blocked',
    status: 'blocked',
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    startedAt: new Date().toISOString(),
    note,
  }
}

function buildBlockedExecutionFinalizeResult(
  runId: string,
  note: string,
  existing?: BuilderExecutionRunRecord | null
): BuilderExecutionFinalizeResult {
  return {
    runId: normalizePrompt(runId) || existing?.runId || createRecordId('brun'),
    requestId: existing?.requestId ?? '',
    scope: BUILDER_REPO_SCOPE,
    target: resolveWorkTarget(existing?.target, existing?.filesChanged),
    executionState: 'blocked',
    status: 'blocked',
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    startedAt: existing?.startedAt ?? '',
    finishedAt: new Date().toISOString(),
    summary: existing?.summary ?? '',
    filesChanged: existing?.filesChanged ?? [],
    commandsRun: existing?.commandsRun ?? [],
    verificationStatus: existing?.verificationStatus ?? 'not-run',
    verificationSummary: existing?.verificationSummary,
    note,
  }
}

function buildBlockedExecutionHistoryResult(note: string): BuilderExecutionHistoryResult {
  return {
    scope: BUILDER_REPO_SCOPE,
    entries: [],
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    status: 'blocked',
    note,
  }
}

function buildBlockedCheckerVerifyResult(runId: string, note: string): CheckerVerifyRunResult {
  return {
    runId: normalizePrompt(runId) || createRecordId('brun'),
    scope: BUILDER_REPO_SCOPE,
    verificationState: 'blocked',
    status: 'blocked',
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    checkedAt: new Date().toISOString(),
    verificationSummary: 'Checker could not attach a truthful review result to this run.',
    note,
  }
}

function toStoredRequestRecord(result: BuilderExecutionRequestCreateResult): BuilderExecutionRequestRecord {
  return {
    requestId: result.requestId,
    scope: result.scope,
    sourceRunId: result.sourceRunId,
    remediationKind: result.remediationKind,
    summary: result.summary,
    target: result.target,
    likelyFiles: result.likelyFiles,
    approvalState: result.approvalState,
    status: result.status,
    createdAt: result.createdAt,
    source: result.source,
    sourceLabel: result.sourceLabel,
    note: result.note,
  }
}

function toStoredRunRecord(result: BuilderExecutionStartResult): BuilderExecutionRunRecord {
  return {
    runId: result.runId,
    requestId: result.requestId,
    scope: result.scope,
    sourceRunId: result.sourceRunId,
    remediationKind: result.remediationKind,
    target: result.target,
    startedAt: result.startedAt,
    executionState: result.executionState,
    source: result.source,
    sourceLabel: result.sourceLabel,
    note: result.note,
  }
}

function toStoredFinalizedRunRecord(result: BuilderExecutionFinalizeResult): BuilderExecutionRunRecord {
  return {
    runId: result.runId,
    requestId: result.requestId,
    scope: result.scope,
    sourceRunId: result.sourceRunId,
    remediationKind: result.remediationKind,
    target: result.target,
    startedAt: result.startedAt,
    executionState: result.executionState,
    source: result.source,
    sourceLabel: result.sourceLabel,
    finishedAt: result.finishedAt,
    summary: result.summary,
    filesChanged: result.filesChanged,
    commandsRun: result.commandsRun,
    verificationStatus: result.verificationStatus,
    verificationSummary: result.verificationSummary,
    note: result.note,
  }
}

function toHistoryEntry(
  run: BuilderExecutionRunRecord,
  request: BuilderExecutionRequestRecord | null
): BuilderExecutionHistoryEntry {
  const requestAvailable = request && request.scope === BUILDER_REPO_SCOPE ? request : null
  const target = resolveWorkTarget(
    requestAvailable?.target ?? run.target,
    requestAvailable?.likelyFiles ?? run.filesChanged
  )
  const baseNote = requestAvailable
    ? run.note
    : `${run.note} Stored request metadata was unavailable while building execution history, so request context is partial.`
  const note = run.checkerNote ? `${baseNote} ${run.checkerNote}` : baseNote

  return {
    runId: run.runId,
    requestId: run.requestId,
    scope: BUILDER_REPO_SCOPE,
    sourceRunId: requestAvailable?.sourceRunId ?? run.sourceRunId,
    remediationKind: requestAvailable?.remediationKind ?? run.remediationKind,
    taskSummary: requestAvailable?.summary ?? '',
    target,
    likelyFiles: requestAvailable?.likelyFiles ?? [],
    approvalState: requestAvailable?.approvalState ?? 'blocked',
    executionState: run.executionState,
    createdAt: requestAvailable?.createdAt ?? run.startedAt,
    settledAt: requestAvailable?.settledAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    summary: run.summary,
    filesChanged: run.filesChanged ?? [],
    commandsRun: run.commandsRun ?? [],
    verificationStatus: run.verificationStatus ?? 'not-run',
    builderVerificationSummary: run.verificationSummary,
    checkedAt: run.checkerCheckedAt,
    verificationState: run.checkerVerificationState,
    verificationSummary: run.checkerVerificationSummary,
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    note,
  }
}

export function handleBuilderPlanTask(payload: BuilderPlanBridgeRequest): BuilderPlanBridgeResult {
  const taskPrompt = normalizePrompt(String(payload?.taskPrompt ?? ''))

  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedPlanResult(
      taskPrompt,
      `Builder bridge blocked the request because scope must be exactly ${BUILDER_REPO_SCOPE}. No execution, approval, or file mutation happened.`
    )
  }

  if (payload?.mode !== 'plan-only') {
    return buildBlockedPlanResult(
      taskPrompt,
      'Builder bridge blocked the request because the mode must be "plan-only". No execution, approval, or file mutation happened.'
    )
  }

  if (taskPrompt.length < 8) {
    return buildBlockedPlanResult(
      taskPrompt,
      'Builder bridge blocked the request because the task prompt is too short to scope honestly. No repo inspection, execution, approval, or file mutation happened.'
    )
  }

  const likelyFiles = deriveLikelyFiles(taskPrompt)
  const result: BuilderPlanBridgeResult = {
    id: createRecordId('bp'),
    taskPrompt,
    scope: BUILDER_REPO_SCOPE,
    mode: 'plan-only',
    taskSummary: buildTaskSummary(taskPrompt),
    target: resolveWorkTarget(undefined, likelyFiles),
    likelyFiles,
    acceptanceCriteria: deriveAcceptanceCriteria(taskPrompt),
    verificationPath: deriveVerificationPath(taskPrompt),
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    status: 'plan-ready',
    note: 'Plan generated by the real Builder bridge. Planning and packaging happened, but no repo inspection, code execution, approval settlement, file mutation, or verification command has happened.',
    createdAt: new Date().toISOString(),
  }

  planRecords.set(result.id, result)
  return result
}

export function handleBuilderCreateExecutionRequest(
  payload: BuilderExecutionRequestCreateInput
): BuilderExecutionRequestCreateResult {
  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedExecutionRequest(
      `Builder bridge blocked the request because scope must be exactly ${BUILDER_REPO_SCOPE}. No approval was settled and no execution happened.`
    )
  }

  if (payload?.mode !== 'approval-gated execution request') {
    return buildBlockedExecutionRequest(
      'Builder bridge blocked the request because the mode must be "approval-gated execution request". No approval was settled and no execution happened.'
    )
  }

  const approvedPlan = payload?.approvedPlan
  if (
    !approvedPlan ||
    approvedPlan.scope !== BUILDER_REPO_SCOPE ||
    approvedPlan.mode !== 'plan-only' ||
    approvedPlan.status !== 'plan-ready' ||
    typeof approvedPlan.id !== 'string' ||
    !approvedPlan.id ||
    typeof approvedPlan.taskPrompt !== 'string' ||
    !normalizePrompt(approvedPlan.taskPrompt) ||
    typeof approvedPlan.taskSummary !== 'string' ||
    !normalizePrompt(approvedPlan.taskSummary)
  ) {
    return buildBlockedExecutionRequest(
      'Builder bridge blocked the request because the approved plan payload was incomplete or not plan-ready. No approval was settled and no execution happened.'
    )
  }

  const normalizedLikelyFiles = normalizeReportedFiles(approvedPlan?.likelyFiles)
  if (!normalizedLikelyFiles.ok) {
    return buildBlockedExecutionRequest(
      `Builder bridge blocked the request because likelyFiles must stay inside ${BUILDER_REPO_SCOPE}. No approval was settled and no execution happened.`
    )
  }

  const target = resolveWorkTarget(approvedPlan?.target, normalizedLikelyFiles.files)
  const result: BuilderExecutionRequestCreateResult = {
    requestId: createRecordId('ber'),
    approvalState: 'awaiting-approval',
    scope: BUILDER_REPO_SCOPE,
    summary: buildExecutionRequestSummary(normalizePrompt(approvedPlan.taskSummary)),
    target,
    likelyFiles: normalizedLikelyFiles.files.slice(0, 5),
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    status: 'awaiting-approval',
    createdAt: new Date().toISOString(),
    note: 'Execution request recorded by the real Builder bridge. Approval is still required. No code execution, file mutation, or verification has happened.',
  }

  saveRequestRecord(toStoredRequestRecord(result))
  return result
}

export function handleBuilderCreateRemediationRequest(
  payload: BuilderExecutionRemediationRequestInput
): BuilderExecutionRemediationRequestResult {
  const sourceRunId = normalizePrompt(String(payload?.sourceRunId ?? ''))
  const remediationPrompt = normalizePrompt(String(payload?.remediationPrompt ?? ''))

  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedRemediationRequest(
      sourceRunId,
      `Builder bridge blocked the remediation request because scope must be exactly ${BUILDER_REPO_SCOPE}. No approval was settled and no execution happened.`
    )
  }

  if (payload?.mode !== 'manual remediation request') {
    return buildBlockedRemediationRequest(
      sourceRunId,
      'Builder bridge blocked the remediation request because the mode must be "manual remediation request". No approval was settled and no execution happened.'
    )
  }

  if (!sourceRunId) {
    return buildBlockedRemediationRequest(
      sourceRunId,
      'Builder bridge blocked the remediation request because sourceRunId is missing. No approval was settled and no execution happened.'
    )
  }

  if (!remediationPrompt) {
    return buildBlockedRemediationRequest(
      sourceRunId,
      'Builder bridge blocked the remediation request because remediationPrompt is required. No approval was settled and no execution happened.'
    )
  }

  const sourceRun = getRunRecord(sourceRunId)
  if (!sourceRun) {
    return buildBlockedRemediationRequest(
      sourceRunId,
      'Builder bridge blocked the remediation request because the source run record does not exist. No approval was settled and no execution happened.'
    )
  }

  if (isStoredRunMalformed(sourceRun)) {
    return buildBlockedRemediationRequest(
      sourceRunId,
      'Builder bridge blocked the remediation request because the source run record is malformed. No approval was settled and no execution happened.',
      sourceRun.target
    )
  }

  if (sourceRun.executionState !== 'failed' && sourceRun.executionState !== 'blocked') {
    return buildBlockedRemediationRequest(
      sourceRunId,
      `Builder bridge blocked the remediation request because source run ${sourceRunId} is "${sourceRun.executionState}", not failed or blocked.`,
      sourceRun.target
    )
  }

  const existingFollowUp = findRequestRecordBySourceRunId(sourceRunId)
  if (existingFollowUp) {
    return buildBlockedRemediationRequest(
      sourceRunId,
      `Builder bridge blocked the remediation request because source run ${sourceRunId} already has remediation request ${existingFollowUp.requestId}. Additional retries and queues are not wired yet.`,
      existingFollowUp.target ?? sourceRun.target
    )
  }

  const sourceRequestCandidate = getRequestRecord(sourceRun.requestId)
  const sourceRequest = sourceRequestCandidate && !isStoredRequestMalformed(sourceRequestCandidate)
    ? sourceRequestCandidate
    : null
  const likelyFiles = deriveRemediationLikelyFiles(sourceRun, sourceRequest)
  const target = resolveWorkTarget(sourceRequest?.target ?? sourceRun.target, likelyFiles)
  const remediationKind = deriveRemediationKind()

  const result: BuilderExecutionRemediationRequestResult = {
    requestId: createRecordId('ber'),
    sourceRunId,
    remediationKind,
    scope: BUILDER_REPO_SCOPE,
    approvalState: 'awaiting-approval',
    status: 'awaiting-approval',
    summary: buildRemediationSummary(sourceRunId, remediationPrompt, remediationKind),
    likelyFiles,
    target,
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    createdAt: new Date().toISOString(),
    note: `Manual ${remediationKind} remediation request recorded for source run ${sourceRunId}. Approval is still required. This does not supersede the earlier run, does not auto-approve, and does not start execution.`,
  }

  saveRequestRecord({
    ...toStoredRequestRecord(result),
    sourceRunId,
    remediationKind,
  })

  return result
}

export function handleBuilderSettleExecutionRequest(
  payload: BuilderExecutionRequestSettleInput
): BuilderExecutionRequestSettleResult {
  const requestId = normalizePrompt(String(payload?.requestId ?? ''))

  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedSettlementResult(
      requestId,
      `Builder bridge blocked the settlement because scope must be exactly ${BUILDER_REPO_SCOPE}. Execution has not started.`
    )
  }

  if (!requestId) {
    return buildBlockedSettlementResult(
      requestId,
      'Builder bridge blocked the settlement because requestId is missing. Execution has not started.'
    )
  }

  if (payload?.decidedBy !== 'ui-user') {
    return buildBlockedSettlementResult(
      requestId,
      'Builder bridge blocked the settlement because decidedBy must be "ui-user". Execution has not started.'
    )
  }

  if (payload?.action !== 'approve' && payload?.action !== 'deny') {
    return buildBlockedSettlementResult(
      requestId,
      'Builder bridge blocked the settlement because the action must be "approve" or "deny". Execution has not started.'
    )
  }

  const existing = getRequestRecord(requestId)
  if (!existing) {
    return buildBlockedSettlementResult(
      requestId,
      'Builder bridge blocked the settlement because the request record does not exist. Execution has not started.'
    )
  }

  if (existing.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedSettlementResult(
      requestId,
      `Builder bridge blocked the settlement because the stored request scope no longer matches ${BUILDER_REPO_SCOPE}. Execution has not started.`
    )
  }

  if (existing.approvalState !== 'awaiting-approval' || existing.status !== 'awaiting-approval') {
    return buildBlockedSettlementResult(
      requestId,
      `Builder bridge blocked the settlement because this request is already in terminal state "${existing.status}". Execution has not started.`
    )
  }

  const settledAt = new Date().toISOString()
  const reason = normalizePrompt(String(payload.reason ?? ''))
  const nextState = payload.action === 'approve' ? 'approved' : 'denied'
  const reasonSuffix = reason ? ` Reason: ${reason}.` : ''
  const nextNote = payload.action === 'approve'
    ? `Execution request approved by ui-user.${reasonSuffix} No execution has started yet. Start requires a separate execution-start call.`
    : `Execution request denied by ui-user.${reasonSuffix} No execution has started.`

  saveRequestRecord({
    ...existing,
    approvalState: nextState,
    status: nextState,
    settledAt,
    note: nextNote,
  })

  return {
    requestId,
    scope: BUILDER_REPO_SCOPE,
    approvalState: nextState,
    status: nextState,
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    settledAt,
    note: nextNote,
  }
}

export async function handleBuilderStartExecution(
  payload: BuilderExecutionStartInput,
  bridge: OpenClawBridge
): Promise<BuilderExecutionStartResult> {
  const requestId = normalizePrompt(String(payload?.requestId ?? ''))

  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedExecutionStartResult(
      requestId,
      `Builder bridge blocked execution start because scope must be exactly ${BUILDER_REPO_SCOPE}.`
    )
  }

  if (payload?.mode !== 'approved execution start') {
    return buildBlockedExecutionStartResult(
      requestId,
      'Builder bridge blocked execution start because the mode must be "approved execution start".'
    )
  }

  if (!requestId) {
    return buildBlockedExecutionStartResult(
      requestId,
      'Builder bridge blocked execution start because requestId is missing.'
    )
  }

  const request = getRequestRecord(requestId)
  if (!request) {
    return buildBlockedExecutionStartResult(
      requestId,
      'Builder bridge blocked execution start because the request record does not exist.'
    )
  }

  if (request.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedExecutionStartResult(
      requestId,
      `Builder bridge blocked execution start because the stored request scope no longer matches ${BUILDER_REPO_SCOPE}.`
    )
  }

  if (request.approvalState !== 'approved' || request.status !== 'approved') {
    return buildBlockedExecutionStartResult(
      requestId,
      `Builder bridge blocked execution start because this request is currently "${request.status}", not approved.`,
      request.target
    )
  }

  const existingRun = getRunRecordForRequest(requestId)
  if (existingRun) {
    return buildBlockedExecutionStartResult(
      requestId,
      `Builder bridge blocked execution start because request ${requestId} already has recorded run ${existingRun.runId}. Rerun and restart flows are not wired yet.`,
      request.target
    )
  }

  try {
    const runId = createRecordId('brun')
    const target = resolveWorkTarget(request.target, request.likelyFiles)

    const result: BuilderExecutionStartResult = {
      runId,
      requestId,
      scope: BUILDER_REPO_SCOPE,
      sourceRunId: request.sourceRunId,
      remediationKind: request.remediationKind,
      target,
      executionState: 'started',
      status: 'started',
      source: 'real-bridge',
      sourceLabel: 'real bridge',
      startedAt: new Date().toISOString(),
      note: 'Approved Builder execution run queued for the Jarvis repo. Actual dispatch will happen as soon as a scheduler slot is available.',
    }

    saveRunRecord(toStoredRunRecord(result))

    await bridge.startDetachedMessage(
      buildExecutionStartPrompt(request, runId),
      requestId,
      (text, state) => autoFinalizeRun(runId, text, state),
      'coding'  // route to the dedicated coding agent (Steve)
    )

    return result
  } catch (error) {
    return buildBlockedExecutionStartResult(
      requestId,
      error instanceof Error
        ? `Builder bridge could not truthfully launch the approved execution run: ${error.message}`
        : 'Builder bridge could not truthfully launch the approved execution run.',
      request.target
    )
  }
}

export function handleBuilderFinalizeExecution(
  payload: BuilderExecutionFinalizeInput
): BuilderExecutionFinalizeResult {
  const runId = normalizePrompt(String(payload?.runId ?? ''))

  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedExecutionFinalizeResult(
      runId,
      `Builder bridge blocked execution finalization because scope must be exactly ${BUILDER_REPO_SCOPE}.`
    )
  }

  if (!runId) {
    return buildBlockedExecutionFinalizeResult(
      runId,
      'Builder bridge blocked execution finalization because runId is missing.'
    )
  }

  const run = getRunRecord(runId)
  if (!run) {
    return buildBlockedExecutionFinalizeResult(
      runId,
      'Builder bridge blocked execution finalization because the run record does not exist.'
    )
  }

  if (isStoredRunMalformed(run)) {
    return buildBlockedExecutionFinalizeResult(
      runId,
      'Builder bridge blocked execution finalization because the stored run record is malformed.',
      run
    )
  }

  if (run.executionState !== 'started') {
    return buildBlockedExecutionFinalizeResult(
      runId,
      `Builder bridge blocked execution finalization because this run is already "${run.executionState}", not started.`,
      run
    )
  }

  if (payload.outcome !== 'completed' && payload.outcome !== 'blocked' && payload.outcome !== 'failed') {
    return buildBlockedExecutionFinalizeResult(
      runId,
      'Builder bridge blocked execution finalization because the outcome must be "completed", "blocked", or "failed".',
      run
    )
  }

  const summary = normalizePrompt(String(payload.summary ?? ''))
  if (!summary) {
    return buildBlockedExecutionFinalizeResult(
      runId,
      'Builder bridge blocked execution finalization because a concise non-empty summary is required.',
      run
    )
  }

  const verificationStatus = payload.verificationStatus
  if (verificationStatus !== 'passed' && verificationStatus !== 'failed' && verificationStatus !== 'not-run') {
    return buildBlockedExecutionFinalizeResult(
      runId,
      'Builder bridge blocked execution finalization because verificationStatus must be "passed", "failed", or "not-run".',
      run
    )
  }

  const normalizedFiles = normalizeReportedFiles(payload.filesChanged)
  if (!normalizedFiles.ok) {
    return buildBlockedExecutionFinalizeResult(
      runId,
      `Builder bridge blocked execution finalization because filesChanged must stay inside ${BUILDER_REPO_SCOPE}.`,
      run
    )
  }

  const commandsRun = normalizeStringList(payload.commandsRun, 25)
  const verificationSummary = normalizePrompt(String(payload.verificationSummary ?? '')) || undefined

  if (payload.outcome === 'completed') {
    const contractIssues = getCompletionContractIssues('completed', normalizedFiles.files, commandsRun, verificationStatus)
    if (contractIssues.length > 0) {
      return buildBlockedExecutionFinalizeResult(
        runId,
        `Builder bridge blocked execution finalization because the completion contract was violated: ${contractIssues.join('; ')}. Report the true outcome (failed or blocked) instead.`,
        run
      )
    }
  }

  const finishedAt = new Date().toISOString()
  const note = `Builder execution run finalized as ${payload.outcome} by the real bridge. Verification status is recorded as ${verificationStatus}. Checker verification is not implied by this result report.`
  const target = resolveWorkTarget(run.target, normalizedFiles.files)

  const result: BuilderExecutionFinalizeResult = {
    runId: run.runId,
    requestId: run.requestId,
    scope: BUILDER_REPO_SCOPE,
    sourceRunId: run.sourceRunId,
    remediationKind: run.remediationKind,
    target,
    executionState: payload.outcome,
    status: payload.outcome,
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    startedAt: run.startedAt,
    finishedAt,
    summary,
    filesChanged: normalizedFiles.files,
    commandsRun,
    verificationStatus,
    verificationSummary,
    note,
  }

  saveRunRecord(toStoredFinalizedRunRecord(result))
  return result
}

export function handleBuilderListExecutionHistory(
  payload: BuilderExecutionHistoryQuery
): BuilderExecutionHistoryResult {
  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedExecutionHistoryResult(
      `Builder bridge blocked execution history because scope must be exactly ${BUILDER_REPO_SCOPE}.`
    )
  }

  const requestStore = readRequestStore()
  const storedRuns = Object.values(readRunStore().runs)
  const validRuns = storedRuns.filter((run) => run.scope === BUILDER_REPO_SCOPE && !isStoredRunMalformed(run))
  const skippedRuns = storedRuns.length - validRuns.length

  const entries = validRuns
    .map((run) => toHistoryEntry(run, requestStore.requests[run.requestId] ?? null))
    .sort((a, b) => resolveHistoryTimestamp(b) - resolveHistoryTimestamp(a))

  const note = entries.length === 0
    ? 'No Builder execution runs have been recorded in the persistent local run store yet.'
    : skippedRuns > 0
      ? `Canonical Builder execution history loaded from the real request/run stores. ${skippedRuns} malformed stored run ${skippedRuns === 1 ? 'entry was' : 'entries were'} skipped.`
      : 'Canonical Builder execution history loaded from the real persistent request/run stores.'

  return {
    scope: BUILDER_REPO_SCOPE,
    entries,
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    status: 'ok',
    note,
  }
}

export function handleCheckerVerifyRun(
  payload: CheckerVerifyRunInput
): CheckerVerifyRunResult {
  const runId = normalizePrompt(String(payload?.runId ?? ''))

  if (payload?.scope !== BUILDER_REPO_SCOPE) {
    return buildBlockedCheckerVerifyResult(
      runId,
      `Checker blocked verification because scope must be exactly ${BUILDER_REPO_SCOPE}.`
    )
  }

  if (payload?.mode !== 'manual finalized-run verification') {
    return buildBlockedCheckerVerifyResult(
      runId,
      'Checker blocked verification because the mode must be "manual finalized-run verification".'
    )
  }

  if (!runId) {
    return buildBlockedCheckerVerifyResult(
      runId,
      'Checker blocked verification because runId is missing.'
    )
  }

  const run = getRunRecord(runId)
  if (!run) {
    return buildBlockedCheckerVerifyResult(
      runId,
      'Checker blocked verification because the run record does not exist.'
    )
  }

  if (isStoredRunMalformed(run)) {
    return buildBlockedCheckerVerifyResult(
      runId,
      'Checker blocked verification because the stored run record is malformed.'
    )
  }

  if (run.executionState === 'started') {
    return buildBlockedCheckerVerifyResult(
      runId,
      'Checker blocked verification because this run has not been finalized yet.'
    )
  }

  if (run.checkerVerificationState && run.checkerCheckedAt) {
    return buildBlockedCheckerVerifyResult(
      runId,
      `Checker blocked verification because this run already has recorded verification state "${run.checkerVerificationState}".`
    )
  }

  const prompt = normalizePrompt(String(payload.verificationPrompt ?? ''))
  const promptSuffix = prompt ? ` Review focus: ${prompt}.` : ''
  const checkedAt = new Date().toISOString()

  let verificationState: CheckerVerifyRunResult['verificationState']
  let verificationSummary: string

  if (run.executionState === 'failed') {
    verificationState = 'failed'
    verificationSummary = `Checker review marked this finalized run as failed because the stored Builder execution outcome is failed.${promptSuffix}`
  } else if (run.executionState === 'blocked') {
    verificationState = 'blocked'
    verificationSummary = `Checker review could not verify this finalized run truthfully because the stored Builder execution outcome is blocked.${promptSuffix}`
  } else if (run.verificationStatus === 'passed') {
    verificationState = 'passed'
    verificationSummary = `Checker review accepted this finalized completed run because the stored Builder report recorded verification status passed.${promptSuffix}`
  } else if (run.verificationStatus === 'failed') {
    verificationState = 'failed'
    verificationSummary = `Checker review marked this finalized completed run as failed because the stored Builder report recorded verification status failed.${promptSuffix}`
  } else {
    verificationState = 'blocked'
    verificationSummary = `Checker review could not verify this finalized completed run truthfully because the stored Builder report did not include passing verification evidence.${promptSuffix}`
  }

  const note = 'Checker review was attached to the existing finalized Builder run as a separate manual verification step. No rerun, automatic remediation, or live repo analysis happened.'

  saveRunRecord({
    ...run,
    checkerCheckedAt: checkedAt,
    checkerVerificationState: verificationState,
    checkerVerificationSummary: verificationSummary,
    checkerSource: 'real-bridge',
    checkerSourceLabel: 'real bridge',
    checkerNote: note,
  })

  return {
    runId,
    scope: BUILDER_REPO_SCOPE,
    verificationState,
    status: verificationState,
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    checkedAt,
    verificationSummary,
    note,
  }
}
