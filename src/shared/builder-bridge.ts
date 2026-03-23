export const BUILDER_REPO_SCOPE = '/Users/ahmedh005/Jarvis' as const

export type BuilderRepoScope = typeof BUILDER_REPO_SCOPE
export type BuilderExecutionRequestApprovalState =
  | 'awaiting-approval'
  | 'approved'
  | 'denied'
  | 'blocked'
export type BuilderExecutionVerificationStatus = 'passed' | 'failed' | 'not-run'
export type BuilderExecutionTerminalState = 'completed' | 'blocked' | 'failed'
export type BuilderExecutionRunState = 'started' | BuilderExecutionTerminalState
export type CheckerVerificationState = 'passed' | 'failed' | 'blocked'
export type BuilderWorkTargetType = 'app' | 'package' | 'docs' | 'repo'
export type BuilderRemediationKind = 'retry' | 'fix-forward'

export interface BuilderWorkTarget {
  targetType: BuilderWorkTargetType
  targetId: string
  targetLabel: string
  targetPaths: string[]
}

function normalizeBuilderTargetPath(pathValue: string): string | null {
  const trimmed = pathValue.replace(/\\/g, '/').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return null

  const parts = trimmed.split('/').filter(Boolean)
  if (parts.some((part) => part === '..')) return null
  if (parts.length === 0) return '.'

  return parts.join('/')
}

function uniqueNormalizedTargetPaths(paths: string[]): string[] {
  const out: string[] = []

  for (const pathValue of paths) {
    const normalized = normalizeBuilderTargetPath(pathValue)
    if (!normalized || out.includes(normalized)) continue
    out.push(normalized)
  }

  return out
}

function buildScopedWorkTarget(
  targetType: BuilderWorkTargetType,
  targetId: string,
  targetLabel: string,
  targetPaths: string[]
): BuilderWorkTarget {
  return {
    targetType,
    targetId,
    targetLabel,
    targetPaths: uniqueNormalizedTargetPaths(targetPaths),
  }
}

export function buildBuilderRepoTarget(): BuilderWorkTarget {
  return buildScopedWorkTarget('repo', 'repo', 'repo', ['.'])
}

export function inferBuilderWorkTarget(targetPaths: string[]): BuilderWorkTarget {
  const normalizedPaths = uniqueNormalizedTargetPaths(targetPaths)
  if (normalizedPaths.length === 0) {
    return buildBuilderRepoTarget()
  }

  const appRoots = new Set<string>()
  const packageRoots = new Set<string>()
  const docsRoots = new Set<string>()
  let docsOnly = true

  for (const targetPath of normalizedPaths) {
    const [root, child] = targetPath.split('/')

    if (root === 'apps' && child) {
      appRoots.add(child)
      docsOnly = false
      continue
    }

    if (root === 'packages' && child) {
      packageRoots.add(child)
      docsOnly = false
      continue
    }

    if (root === 'docs') {
      docsRoots.add(child ? `docs/${child}` : 'docs')
      continue
    }

    docsOnly = false
    return buildBuilderRepoTarget()
  }

  if (appRoots.size === 1 && packageRoots.size === 0 && docsRoots.size === 0) {
    const appId = Array.from(appRoots)[0]
    return buildScopedWorkTarget('app', `app/${appId}`, `app/${appId}`, [`apps/${appId}`])
  }

  if (packageRoots.size === 1 && appRoots.size === 0 && docsRoots.size === 0) {
    const packageId = Array.from(packageRoots)[0]
    return buildScopedWorkTarget('package', `package/${packageId}`, `package/${packageId}`, [`packages/${packageId}`])
  }

  if (docsOnly && appRoots.size === 0 && packageRoots.size === 0) {
    if (docsRoots.size === 1) {
      const docsId = Array.from(docsRoots)[0]
      return buildScopedWorkTarget('docs', docsId, docsId, [docsId])
    }

    return buildScopedWorkTarget('docs', 'docs', 'docs', ['docs'])
  }

  return buildBuilderRepoTarget()
}

export function normalizeBuilderWorkTarget(
  target: Partial<BuilderWorkTarget> | null | undefined,
  fallbackPaths: string[] = []
): BuilderWorkTarget {
  const fallbackTarget = inferBuilderWorkTarget(fallbackPaths)
  if (!target) return fallbackTarget

  const targetType = target.targetType
  const targetId = typeof target.targetId === 'string' ? target.targetId.trim() : ''
  const targetLabel = typeof target.targetLabel === 'string' ? target.targetLabel.trim() : ''
  const targetPaths = uniqueNormalizedTargetPaths(
    Array.isArray(target.targetPaths)
      ? target.targetPaths.filter((value): value is string => typeof value === 'string')
      : []
  )

  if (
    (targetType !== 'app' && targetType !== 'package' && targetType !== 'docs' && targetType !== 'repo') ||
    !targetId ||
    !targetLabel
  ) {
    return fallbackTarget
  }

  if (targetType === 'repo') {
    return buildBuilderRepoTarget()
  }

  if (targetPaths.length === 0) {
    return fallbackTarget
  }

  return buildScopedWorkTarget(targetType, targetId, targetLabel, targetPaths)
}

export interface BuilderExecutionHistoryQuery {
  scope: BuilderRepoScope
}

export interface BuilderPlanBridgeRequest {
  taskPrompt: string
  scope: BuilderRepoScope
  mode: 'plan-only'
}

export interface BuilderPlanBridgeResult {
  id: string
  taskPrompt: string
  scope: BuilderRepoScope
  mode: 'plan-only'
  taskSummary: string
  target: BuilderWorkTarget
  likelyFiles: string[]
  acceptanceCriteria: string[]
  verificationPath: string[]
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  status: 'plan-ready' | 'blocked'
  note: string
  createdAt: string
}

export interface BuilderExecutionRequestCreateInput {
  approvedPlan: {
    id: string
    taskPrompt: string
    scope: BuilderRepoScope
    mode: 'plan-only'
    taskSummary: string
    target?: BuilderWorkTarget
    likelyFiles: string[]
    acceptanceCriteria: string[]
    verificationPath: string[]
    source: 'real-bridge' | 'local-demo-fallback'
    status: 'plan-ready'
  }
  scope: BuilderRepoScope
  mode: 'approval-gated execution request'
}

export interface BuilderExecutionRequestCreateResult {
  requestId: string
  approvalState: 'awaiting-approval' | 'blocked'
  scope: BuilderRepoScope
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  summary: string
  target: BuilderWorkTarget
  likelyFiles: string[]
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  status: 'awaiting-approval' | 'blocked'
  createdAt: string
  note: string
}

export interface BuilderExecutionRequestRecord {
  requestId: string
  scope: BuilderRepoScope
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  summary: string
  target?: BuilderWorkTarget
  likelyFiles: string[]
  approvalState: BuilderExecutionRequestApprovalState
  status: BuilderExecutionRequestApprovalState
  createdAt: string
  settledAt?: string
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  note: string
}

export interface BuilderExecutionRequestSettleInput {
  requestId: string
  scope: BuilderRepoScope
  action: 'approve' | 'deny'
  decidedBy: 'ui-user'
  reason?: string
}

export interface BuilderExecutionRequestSettleResult {
  requestId: string
  scope: BuilderRepoScope
  approvalState: 'approved' | 'denied' | 'blocked'
  status: 'approved' | 'denied' | 'blocked'
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  settledAt: string
  note: string
}

export interface BuilderExecutionRemediationRequestInput {
  sourceRunId: string
  scope: BuilderRepoScope
  mode: 'manual remediation request'
  remediationPrompt: string
}

export interface BuilderExecutionRemediationRequestResult {
  requestId: string
  sourceRunId: string
  remediationKind: BuilderRemediationKind
  scope: BuilderRepoScope
  approvalState: 'awaiting-approval' | 'blocked'
  status: 'awaiting-approval' | 'blocked'
  summary: string
  likelyFiles: string[]
  target: BuilderWorkTarget
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  createdAt: string
  note: string
}

export interface BuilderExecutionStartInput {
  requestId: string
  scope: BuilderRepoScope
  mode: 'approved execution start'
}

export interface BuilderExecutionStartResult {
  runId: string
  requestId: string
  scope: BuilderRepoScope
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  target: BuilderWorkTarget
  executionState: 'started' | 'blocked'
  status: 'started' | 'blocked'
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  startedAt: string
  note: string
}

export interface BuilderExecutionFinalizeInput {
  runId: string
  scope: BuilderRepoScope
  outcome: BuilderExecutionTerminalState
  summary: string
  filesChanged?: string[]
  commandsRun?: string[]
  verificationStatus: BuilderExecutionVerificationStatus
  verificationSummary?: string
}

export interface BuilderExecutionFinalizeResult {
  runId: string
  requestId: string
  scope: BuilderRepoScope
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  target: BuilderWorkTarget
  executionState: BuilderExecutionTerminalState
  status: BuilderExecutionTerminalState
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  startedAt: string
  finishedAt: string
  summary: string
  filesChanged: string[]
  commandsRun: string[]
  verificationStatus: BuilderExecutionVerificationStatus
  verificationSummary?: string
  note: string
}

export interface BuilderExecutionRunRecord {
  runId: string
  requestId: string
  scope: BuilderRepoScope
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  target?: BuilderWorkTarget
  startedAt: string
  executionState: BuilderExecutionRunState
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  finishedAt?: string
  summary?: string
  filesChanged?: string[]
  commandsRun?: string[]
  verificationStatus?: BuilderExecutionVerificationStatus
  verificationSummary?: string
  checkerCheckedAt?: string
  checkerVerificationState?: CheckerVerificationState
  checkerVerificationSummary?: string
  checkerSource?: 'real-bridge'
  checkerSourceLabel?: 'real bridge'
  checkerNote?: string
  note: string
}

export interface BuilderExecutionHistoryEntry {
  runId: string
  requestId: string
  scope: BuilderRepoScope
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  taskSummary: string
  target: BuilderWorkTarget
  likelyFiles: string[]
  approvalState: BuilderExecutionRequestApprovalState
  executionState: BuilderExecutionRunState
  createdAt: string
  settledAt?: string
  startedAt?: string
  finishedAt?: string
  summary?: string
  filesChanged: string[]
  commandsRun: string[]
  verificationStatus?: BuilderExecutionVerificationStatus
  builderVerificationSummary?: string
  checkedAt?: string
  verificationState?: CheckerVerificationState
  verificationSummary?: string
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  note: string
}

export interface BuilderExecutionHistoryResult {
  scope: BuilderRepoScope
  entries: BuilderExecutionHistoryEntry[]
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  status: 'ok' | 'blocked'
  note: string
}

export interface CheckerVerifyRunInput {
  runId: string
  scope: BuilderRepoScope
  mode: 'manual finalized-run verification'
  verificationPrompt?: string
}

export interface CheckerVerifyRunResult {
  runId: string
  scope: BuilderRepoScope
  verificationState: CheckerVerificationState
  status: CheckerVerificationState
  source: 'real-bridge'
  sourceLabel: 'real bridge'
  checkedAt: string
  verificationSummary: string
  note: string
}
