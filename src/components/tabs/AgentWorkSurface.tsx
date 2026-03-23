import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  PlayCircle,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { ResearcherSurface } from './ResearcherSurface'
import type { BuilderPlanResult } from '@/adapters/builder-plan'
import { loadBuilderExecutionHistory, type BuilderExecutionHistoryEntry, type BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import { createBuilderRemediationRequest, type BuilderExecutionRequest } from '@/adapters/builder-execution-request'
import { verifyCheckerRun } from '@/adapters/checker'
import { focusMatchesTarget, type AgentControlSurface } from '@/adapters/agent-control'
import { useBuilderExecutionStore } from '@/store/builder-execution'
import { useBuilderExecutionRequestStore } from '@/store/builder-execution-request'
import { useBuilderPlanStore } from '@/store/builder-plan'
import { RunDetailDrawer } from './RunDetailDrawer'
import { RunStatusBadge } from './RunStatusBadge'
import { EmptyPanel } from './shared'

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return 'pending'

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

// ── Primitives ────────────────────────────────────────────────────────────────

function InlineBadge({
  label,
  color,
  background,
  border,
}: {
  label: string
  color: string
  background: string
  border: string
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-1 text-[9px] font-mono tracking-[0.14em]"
      style={{ color, background, border: `1px solid ${border}` }}
    >
      {label.toUpperCase()}
    </span>
  )
}

function WorkCard({
  title,
  subtitle,
  badges,
  meta,
  children,
}: {
  title: string
  subtitle: string
  badges?: React.ReactNode
  meta?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl px-3 py-3"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium" style={{ color: 'rgba(244,248,252,0.96)' }}>
            {title}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.74)' }}>
            {subtitle}
          </p>
          {meta && (
            <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.42)' }}>
              {meta}
            </p>
          )}
        </div>
        {badges && <div className="flex flex-wrap justify-end gap-2">{badges}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  tone = 'info',
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'info' | 'success' | 'warn'
}) {
  const styles = tone === 'success'
    ? { color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.18)' }
    : tone === 'warn'
      ? { color: '#ffc84a', background: 'rgba(255,200,74,0.08)', border: 'rgba(255,200,74,0.18)' }
      : { color: '#00d4ff', background: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.18)' }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-2 text-[10px] font-mono tracking-[0.16em]"
      style={{
        color:      disabled ? 'rgba(192,232,240,0.34)' : styles.color,
        background: disabled ? 'rgba(255,255,255,0.03)' : styles.background,
        border:     `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : styles.border}`,
        cursor:     disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-xl px-3 py-2 text-[11px] leading-relaxed outline-none"
      style={{
        color: 'rgba(192,232,240,0.92)',
        background: 'rgba(4,10,18,0.82)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    />
  )
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl px-3 py-2 text-[11px] outline-none"
      style={{
        color: 'rgba(192,232,240,0.92)',
        background: 'rgba(4,10,18,0.82)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function SectionLabel({ icon: Icon, label, accent }: { icon: typeof Wrench; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <Icon className="h-3 w-3" style={{ color: accent }} />
      <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: accent }}>{label}</span>
    </div>
  )
}

function planMatchesFocus(surface: AgentControlSurface, plan: BuilderPlanResult | null): plan is BuilderPlanResult {
  return Boolean(plan && focusMatchesTarget(surface.focusTarget, plan.target, plan.likelyFiles))
}

// ── Main export ────────────────────────────────────────────────────────────────
// Renders in two modes:
//   mode="actions"  → only the actionable section (Needs Action) — used as primary visible content
//   mode="work"     → assigned work + recent outcomes — used inside collapsed Work section

export function AgentWorkSurface({
  surface,
  history,
  onHistoryChange,
  accent,
  mode = 'actions',
}: {
  surface: AgentControlSurface
  history: BuilderExecutionHistorySnapshot
  onHistoryChange: (history: BuilderExecutionHistorySnapshot) => void
  accent: string
  mode?: 'actions' | 'work'
}) {
  const planPrompt = useBuilderPlanStore((state) => state.prompt)
  const planResult = useBuilderPlanStore((state) => state.result)
  const request = useBuilderExecutionRequestStore((state) => state.request)
  const requestQueue = useBuilderExecutionRequestStore((state) => state.requestQueue)
  const requestPhase = useBuilderExecutionRequestStore((state) => state.phase)
  const pendingRequestAction = useBuilderExecutionRequestStore((state) => state.pendingAction)
  const createRequestFromPlan = useBuilderExecutionRequestStore((state) => state.createRequestFromPlan)
  const adoptRequest = useBuilderExecutionRequestStore((state) => state.adoptRequest)
  const queueRequest = useBuilderExecutionRequestStore((state) => state.queueRequest)
  const settleRequest = useBuilderExecutionRequestStore((state) => state.settleRequest)
  const batchApprove = useBuilderExecutionRequestStore((state) => state.batchApprove)
  const batchApprovePhase = useBuilderExecutionRequestStore((state) => state.batchApprovePhase)
  const batchApproveCount = useBuilderExecutionRequestStore((state) => state.batchApproveCount)
  const clearBatchFeedback = useBuilderExecutionRequestStore((state) => state.clearBatchFeedback)
  const executionRun = useBuilderExecutionStore((state) => state.run)
  const executionPhase = useBuilderExecutionStore((state) => state.phase)
  const executionPendingAction = useBuilderExecutionStore((state) => state.pendingAction)
  const startExecution = useBuilderExecutionStore((state) => state.startExecution)
  const batchStart = useBuilderExecutionStore((state) => state.batchStart)
  const batchStartPhase = useBuilderExecutionStore((state) => state.batchStartPhase)
  const batchStartCount = useBuilderExecutionStore((state) => state.batchStartCount)
  const clearBatchStartFeedback = useBuilderExecutionStore((state) => state.clearBatchStartFeedback)
  const finalizeExecution = useBuilderExecutionStore((state) => state.finalizeExecution)
  const [finalOutcome, setFinalOutcome] = useState<'completed' | 'blocked' | 'failed'>('completed')
  const [finalSummary, setFinalSummary] = useState('')
  const [verificationStatus, setVerificationStatus] = useState<'passed' | 'failed' | 'not-run'>('not-run')
  const [verificationSummary, setVerificationSummary] = useState('')
  const [verifyInputs, setVerifyInputs] = useState<Record<string, string>>({})
  const [verifyPendingId, setVerifyPendingId] = useState<string | null>(null)
  const [verifyFeedback, setVerifyFeedback] = useState<Record<string, string>>({})
  const [batchVerifyPhase, setBatchVerifyPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [batchVerifyCount, setBatchVerifyCount] = useState(0)
  const [batchVerifyFailed, setBatchVerifyFailed] = useState(0)
  const [remediationInputs, setRemediationInputs] = useState<Record<string, string>>({})
  const [remediationPendingId, setRemediationPendingId] = useState<string | null>(null)
  const [remediationFeedback, setRemediationFeedback] = useState<Record<string, string>>({})
  const [batchRemediationPhase, setBatchRemediationPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [batchRemediationCount, setBatchRemediationCount] = useState(0)
  const [batchRemediationFailed, setBatchRemediationFailed] = useState(0)
  const [selectedRun, setSelectedRun] = useState<BuilderExecutionHistoryEntry | null>(null)

  const matchingPlan = planMatchesFocus(surface, planResult) ? planResult : null
  const matchingRequest = request && focusMatchesTarget(surface.focusTarget, request.target, request.likelyFiles) ? request : null
  const matchingRun = executionRun && focusMatchesTarget(surface.focusTarget, executionRun.target) ? executionRun : null
  const matchingHistory = useMemo(
    () =>
      history.entries.filter((entry) =>
        focusMatchesTarget(surface.focusTarget, entry.target, [
          ...entry.likelyFiles,
          ...entry.filesChanged,
        ])
      ),
    [history.entries, surface.focusTarget]
  )

  const verifiableRuns = matchingHistory.filter((entry) => entry.executionState !== 'started' && !entry.verificationState)
  const verifiedRuns = matchingHistory.filter((entry) => Boolean(entry.verificationState))
  const remediationCandidates = matchingHistory.filter((entry) => entry.executionState === 'failed' || entry.executionState === 'blocked')
  const recentOutcomes = matchingHistory
    .filter((entry) => entry.executionState !== 'started')
    .sort((a, b) => new Date(b.finishedAt || b.startedAt || b.createdAt).getTime() - new Date(a.finishedAt || a.startedAt || a.createdAt).getTime())
    .slice(0, 4)
  // Runs already covered by an existing remediation entry in history or the active/queued request.
  // Used to enforce one-remediation-per-source-run constraint in batch remediation.
  const remediatedSourceRunIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of matchingHistory) {
      if (e.sourceRunId) ids.add(e.sourceRunId)
    }
    if (request?.sourceRunId) ids.add(request.sourceRunId)
    for (const r of requestQueue) {
      if (r.sourceRunId) ids.add(r.sourceRunId)
    }
    return ids
  }, [matchingHistory, request, requestQueue])

  // Runs eligible for batch remediation: failed/blocked with no existing remediation
  const batchRemediationEligible = remediationCandidates.filter(
    (e) => !remediatedSourceRunIds.has(e.runId)
  )

  // Runs started via the bridge that are not the current in-memory run.
  // Populated after batch start — these are real history entries, not fabricated state.
  const startedHistoryRuns = surface.id === 'kai'
    ? matchingHistory
        .filter((e) => e.executionState === 'started' && e.runId !== matchingRun?.runId)
        .sort((a, b) => new Date(b.startedAt || b.createdAt).getTime() - new Date(a.startedAt || a.createdAt).getTime())
        .slice(0, 8)
    : []

  useEffect(() => {
    if (!matchingRun || matchingRun.executionState === 'started') return

    void loadBuilderExecutionHistory()
      .then(onHistoryChange)
      .catch(() => undefined)
  }, [matchingRun?.runId, matchingRun?.executionState, onHistoryChange])

  useEffect(() => {
    if (!matchingRun || matchingRun.executionState !== 'started') {
      setFinalOutcome('completed')
      setFinalSummary('')
      setVerificationStatus('not-run')
      setVerificationSummary('')
    }
  }, [matchingRun?.runId, matchingRun?.executionState])

  const finalizeCurrentRun = () => {
    if (!matchingRun || matchingRun.executionState !== 'started' || finalSummary.trim().length === 0) return

    void finalizeExecution({
      outcome: finalOutcome,
      summary: finalSummary.trim(),
      verificationStatus,
      verificationSummary: verificationSummary.trim() || undefined,
    })
  }

  const handleVerify = async (runId: string) => {
    setVerifyPendingId(runId)
    try {
      const result = await verifyCheckerRun(runId, verifyInputs[runId]?.trim() || undefined)
      const refreshed = await loadBuilderExecutionHistory()
      onHistoryChange(refreshed)
      setVerifyInputs((state) => ({ ...state, [runId]: '' }))
      setVerifyFeedback((state) => ({ ...state, [runId]: result.note }))
    } catch (error) {
      setVerifyFeedback((state) => ({
        ...state,
        [runId]: error instanceof Error ? error.message : 'Checker verification failed.',
      }))
    } finally {
      setVerifyPendingId(null)
    }
  }

  const handleBatchVerify = async () => {
    // Snapshot eligibility at click time; filter excludes already-verified
    const targets = verifiableRuns.filter((e) => !e.verificationState)
    if (targets.length === 0) return

    setBatchVerifyPhase('running')
    setBatchVerifyCount(0)
    setBatchVerifyFailed(0)

    let succeeded = 0
    let failed = 0

    for (const entry of targets) {
      try {
        await verifyCheckerRun(entry.runId)
        succeeded++
      } catch {
        failed++
        // Skip and continue — do not cascade failure
      }
    }

    // Single history refresh after all calls complete
    try {
      const refreshed = await loadBuilderExecutionHistory()
      onHistoryChange(refreshed)
    } catch {
      // Refresh failure is non-fatal; history will update on next interaction
    }

    setBatchVerifyCount(succeeded)
    setBatchVerifyFailed(failed)
    setBatchVerifyPhase(succeeded > 0 ? 'done' : 'error')
  }

  const handleRemediation = async (entry: BuilderExecutionHistorySnapshot['entries'][number]) => {
    setRemediationPendingId(entry.runId)
    try {
      const request = await createBuilderRemediationRequest(entry, remediationInputs[entry.runId]?.trim() || '')
      adoptRequest(request as BuilderExecutionRequest)
      setRemediationInputs((state) => ({ ...state, [entry.runId]: '' }))
      setRemediationFeedback((state) => ({ ...state, [entry.runId]: request.note }))
    } catch (error) {
      setRemediationFeedback((state) => ({
        ...state,
        [entry.runId]: error instanceof Error ? error.message : 'Remediation request failed.',
      }))
    } finally {
      setRemediationPendingId(null)
    }
  }

  const handleBatchRemediation = async () => {
    // Re-filter at click time to enforce the one-per-run constraint against current state
    const eligible = batchRemediationEligible
    if (eligible.length === 0) return

    setBatchRemediationPhase('running')
    setBatchRemediationCount(0)
    setBatchRemediationFailed(0)

    let created = 0
    let failed = 0

    for (const entry of eligible) {
      try {
        // Empty prompt — same adapter behaviour as when user submits without a manual description
        const req = await createBuilderRemediationRequest(entry, '')
        // Queue rather than adopt — preserves any active request and lets user work through them
        queueRequest(req as BuilderExecutionRequest)
        created++
      } catch {
        failed++
        // Skip and continue — do not cascade failure
      }
    }

    setBatchRemediationCount(created)
    setBatchRemediationFailed(failed)
    setBatchRemediationPhase(created > 0 ? 'done' : 'error')
  }

  // ── ACTIONS mode — surfaced as the primary always-visible section ──────────────

  if (mode === 'actions') {
    const hasKaiAction =
      surface.id === 'kai' && (
        (matchingPlan && !matchingRequest) ||
        matchingRequest?.approvalState === 'awaiting-approval' ||
        (matchingRequest?.approvalState === 'approved' && !matchingRun) ||
        matchingRun?.executionState === 'started' ||
        remediationCandidates.length > 0
      )

    const hasMayaAction = surface.id === 'maya' && verifiableRuns.length > 0

    if (surface.id === 'kai') {
      return (
        <div className="flex flex-col gap-3">
          <SectionLabel icon={Wrench} label="ACTIONS" accent={accent} />

          {matchingPlan && !matchingRequest && (
            <WorkCard
              title="Create execution request"
              subtitle={matchingPlan.planSummary}
              meta={`${matchingPlan.target.targetLabel} · ${planPrompt.trim().length} chars`}
            >
              <ActionButton
                label={requestPhase === 'loading' && pendingRequestAction === 'create' ? 'CREATING…' : 'CREATE REQUEST'}
                onClick={() => void createRequestFromPlan(matchingPlan)}
                disabled={requestPhase === 'loading'}
              />
            </WorkCard>
          )}

          {matchingRequest?.approvalState === 'awaiting-approval' && (() => {
            // Count all awaiting-approval: active request + queued ones
            const queuedAwaitingCount = requestQueue.filter(
              (r) => r.approvalState === 'awaiting-approval'
            ).length
            const totalAwaiting = 1 + queuedAwaitingCount
            const batchRunning = batchApprovePhase === 'running'

            return (
              <WorkCard
                title="Approval required"
                subtitle={matchingRequest.planSummary}
                meta={`${matchingRequest.id} · ${matchingRequest.target.targetLabel}`}
              >
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={requestPhase === 'loading' && pendingRequestAction === 'approve' ? 'APPROVING…' : 'APPROVE'}
                    onClick={() => void settleRequest('approve')}
                    disabled={requestPhase === 'loading' || batchRunning}
                    tone="success"
                  />
                  <ActionButton
                    label={requestPhase === 'loading' && pendingRequestAction === 'deny' ? 'DENYING…' : 'DENY'}
                    onClick={() => void settleRequest('deny')}
                    disabled={requestPhase === 'loading' || batchRunning}
                    tone="warn"
                  />
                  {totalAwaiting > 1 && (
                    <ActionButton
                      label={batchRunning ? 'APPROVING…' : `APPROVE ALL (${totalAwaiting})`}
                      onClick={() => { clearBatchFeedback(); void batchApprove() }}
                      disabled={requestPhase === 'loading' || batchRunning}
                      tone="success"
                    />
                  )}
                </div>
                {batchApprovePhase === 'done' && (
                  <p className="mt-2 text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.75)' }}>
                    ✓ {batchApproveCount} request{batchApproveCount !== 1 ? 's' : ''} approved
                  </p>
                )}
                {batchApprovePhase === 'error' && (
                  <p className="mt-2 text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.75)' }}>
                    Batch approval failed — try approving individually.
                  </p>
                )}
              </WorkCard>
            )
          })()}

          {matchingRequest?.approvalState === 'approved' && !matchingRun && (() => {
            // Count all approved requests: active + queued
            const queuedApprovedCount = requestQueue.filter(
              (r) => r.approvalState === 'approved'
            ).length
            const totalApproved = 1 + queuedApprovedCount
            const batchRunning = batchStartPhase === 'running'

            return (
              <WorkCard
                title="Start execution"
                subtitle={`${matchingRequest.id} · ${matchingRequest.target.targetLabel}`}
              >
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={executionPhase === 'loading' && executionPendingAction === 'start' ? 'STARTING…' : 'START RUN'}
                    onClick={() => void startExecution(matchingRequest)}
                    disabled={executionPhase === 'loading' || batchRunning}
                    tone="success"
                  />
                  {totalApproved > 1 && (
                    <ActionButton
                      label={batchRunning ? 'STARTING…' : `START ALL APPROVED (${totalApproved})`}
                      onClick={() => {
                        clearBatchStartFeedback()
                        void batchStart([matchingRequest, ...requestQueue])
                      }}
                      disabled={executionPhase === 'loading' || batchRunning}
                      tone="success"
                    />
                  )}
                </div>
                {batchStartPhase === 'done' && (
                  <p className="mt-2 text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.75)' }}>
                    ✓ {batchStartCount} run{batchStartCount !== 1 ? 's' : ''} started
                  </p>
                )}
                {batchStartPhase === 'error' && (
                  <p className="mt-2 text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.75)' }}>
                    Batch start failed — try starting individually.
                  </p>
                )}
              </WorkCard>
            )
          })()}

          {matchingRun?.executionState === 'started' && (
            <WorkCard
              title="Finalize run"
              subtitle={`${matchingRun.runId} · ${matchingRun.target.targetLabel}`}
            >
              <div className="grid grid-cols-1 gap-2">
                <SelectField
                  value={finalOutcome}
                  onChange={(value) => setFinalOutcome(value as 'completed' | 'blocked' | 'failed')}
                  options={[
                    { value: 'completed', label: 'completed' },
                    { value: 'blocked',   label: 'blocked' },
                    { value: 'failed',    label: 'failed' },
                  ]}
                />
                <TextArea
                  value={finalSummary}
                  onChange={setFinalSummary}
                  placeholder="Record the Builder outcome summary."
                />
                <SelectField
                  value={verificationStatus}
                  onChange={(value) => setVerificationStatus(value as 'passed' | 'failed' | 'not-run')}
                  options={[
                    { value: 'not-run', label: 'verification not run' },
                    { value: 'passed',  label: 'verification passed' },
                    { value: 'failed',  label: 'verification failed' },
                  ]}
                />
                <TextArea
                  value={verificationSummary}
                  onChange={setVerificationSummary}
                  placeholder="Optional verification summary."
                  rows={2}
                />
                <ActionButton
                  label={executionPhase === 'loading' && executionPendingAction === 'finalize' ? 'FINALIZING…' : 'FINALIZE RUN'}
                  onClick={finalizeCurrentRun}
                  disabled={executionPhase === 'loading' || finalSummary.trim().length === 0}
                  tone="success"
                />
              </div>
            </WorkCard>
          )}

          {/* Batch remediation — only shown when 2+ eligible runs */}
          {batchRemediationEligible.length > 1 && (() => {
            const batchRunning = batchRemediationPhase === 'running'
            return (
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton
                  label={batchRunning ? 'CREATING…' : `CREATE REMEDIATIONS (${batchRemediationEligible.length})`}
                  onClick={() => { setBatchRemediationPhase('idle'); void handleBatchRemediation() }}
                  disabled={batchRunning || remediationPendingId !== null}
                  tone="warn"
                />
                {batchRemediationPhase === 'done' && (
                  <p className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.80)' }}>
                    ✓ {batchRemediationCount} remediation request{batchRemediationCount !== 1 ? 's' : ''} created
                    {batchRemediationFailed > 0 ? `  ·  ${batchRemediationFailed} failed` : ''}
                  </p>
                )}
                {batchRemediationPhase === 'error' && (
                  <p className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.75)' }}>
                    Batch remediation failed — try creating individually.
                  </p>
                )}
              </div>
            )
          })()}

          {remediationCandidates.slice(0, 2).map((entry) => (
            <WorkCard
              key={entry.runId}
              title={`Remediation · ${entry.runId}`}
              subtitle={entry.taskSummary}
              meta={`${entry.target.targetLabel} · ${entry.executionState}`}
            >
              <div className="grid grid-cols-1 gap-2">
                <TextArea
                  value={remediationInputs[entry.runId] ?? ''}
                  onChange={(value) => setRemediationInputs((state) => ({ ...state, [entry.runId]: value }))}
                  placeholder="Describe the bounded remediation request."
                  rows={2}
                />
                <ActionButton
                  label={remediationPendingId === entry.runId ? 'REQUESTING…' : 'CREATE REMEDIATION'}
                  onClick={() => void handleRemediation(entry)}
                  disabled={remediationPendingId === entry.runId || batchRemediationPhase === 'running' || (remediationInputs[entry.runId] ?? '').trim().length === 0}
                  tone="warn"
                />
                {remediationFeedback[entry.runId] && (
                  <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
                    {remediationFeedback[entry.runId]}
                  </p>
                )}
              </div>
            </WorkCard>
          ))}

          {!hasKaiAction && (
            <EmptyPanel
              icon={Wrench}
              title="No pending actions"
              note="Create a Builder plan first. Once a plan matches Kai's focus, actions will appear here."
            />
          )}
        </div>
      )
    }

    if (surface.id === 'maya') {
      const batchRunning = batchVerifyPhase === 'running'

      return (
        <div className="flex flex-col gap-3">
          <SectionLabel icon={ShieldCheck} label="ACTIONS" accent={accent} />

          {/* Batch verify — only shown when 2+ eligible runs */}
          {verifiableRuns.length > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton
                label={batchRunning ? 'VERIFYING…' : `VERIFY ALL (${verifiableRuns.length})`}
                onClick={() => { setBatchVerifyPhase('idle'); void handleBatchVerify() }}
                disabled={batchRunning || verifyPendingId !== null}
                tone="success"
              />
              {batchVerifyPhase === 'done' && (
                <p className="text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.75)' }}>
                  ✓ {batchVerifyCount} run{batchVerifyCount !== 1 ? 's' : ''} verified
                  {batchVerifyFailed > 0 ? `  ·  ${batchVerifyFailed} failed` : ''}
                </p>
              )}
              {batchVerifyPhase === 'error' && (
                <p className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.75)' }}>
                  Batch verification failed — try verifying individually.
                </p>
              )}
            </div>
          )}

          {verifiableRuns.map((entry) => (
            <WorkCard
              key={entry.runId}
              title={`Verify run · ${entry.runId}`}
              subtitle={entry.taskSummary}
              meta={`${entry.target.targetLabel} · finalized ${formatTimestamp(entry.finishedAt || entry.startedAt || entry.createdAt)}`}
            >
              <div className="grid grid-cols-1 gap-2">
                <TextArea
                  value={verifyInputs[entry.runId] ?? ''}
                  onChange={(value) => setVerifyInputs((state) => ({ ...state, [entry.runId]: value }))}
                  placeholder="Optional review focus for Checker."
                  rows={2}
                />
                <ActionButton
                  label={verifyPendingId === entry.runId ? 'VERIFYING…' : 'VERIFY RUN'}
                  onClick={() => void handleVerify(entry.runId)}
                  disabled={verifyPendingId === entry.runId || batchRunning}
                  tone="success"
                />
                {verifyFeedback[entry.runId] && (
                  <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(0,212,255,0.8)' }}>
                    {verifyFeedback[entry.runId]}
                  </p>
                )}
              </div>
            </WorkCard>
          ))}

          {!hasMayaAction && (
            <EmptyPanel
              icon={ShieldCheck}
              title="No runs awaiting verification"
              note="Finalized Builder runs will appear here once they are ready to be checked."
            />
          )}
        </div>
      )
    }

    // Alex — planning surface
    if (surface.id === 'alex') {
      return (
        <div className="flex flex-col gap-3">
          <SectionLabel icon={CheckCircle2} label="ACTIONS" accent={accent} />
          {matchingPlan ? (
            <WorkCard
              title="Current plan scope"
              subtitle={matchingPlan.planSummary}
              meta={`${matchingPlan.target.targetLabel} · ${formatTimestamp(matchingPlan.createdAt)}`}
              badges={<InlineBadge label={matchingPlan.status} color="#00d4ff" background="rgba(0,212,255,0.08)" border="rgba(0,212,255,0.18)" />}
            />
          ) : (
            <EmptyPanel
              icon={CheckCircle2}
              title="No plan scoped yet"
              note="Use the Builder Plan panel to generate a plan for Alex's focus area."
            />
          )}
        </div>
      )
    }

    // Researcher — research brief surface
    if (surface.id === 'researcher') {
      return <ResearcherSurface accent={accent} />
    }

    // Noah — operational state, no pipeline actions
    return (
      <div className="flex flex-col gap-3">
        <SectionLabel icon={AlertTriangle} label="SYSTEM STATE" accent={accent} />
        <div
          className="rounded-xl px-3 py-3"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[12px] font-medium mb-1" style={{ color: 'rgba(244,248,252,0.96)' }}>
            {surface.focusTarget.targetLabel}
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.74)' }}>
            {surface.lastMeaningfulActivity}
          </p>
          {surface.lastActivityAt && (
            <p className="mt-1.5 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.42)' }}>
              {formatTimestamp(surface.lastActivityAt)}
            </p>
          )}
        </div>
        {surface.blockedCapabilities.length > 0 && (
          <div className="flex flex-col gap-1">
            {surface.blockedCapabilities.slice(0, 3).map((cap) => (
              <div key={cap} className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,107,53,0.04)', border: '1px solid rgba(255,107,53,0.14)' }}>
                <AlertTriangle className="h-3 w-3 flex-shrink-0" style={{ color: '#ff6b35' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.82)' }}>{cap}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── WORK mode — assigned work + recent outcomes (used in collapsed section) ────

  return (
    <>
    <RunDetailDrawer
      entry={selectedRun}
      onClose={() => setSelectedRun(null)}
      remediatedRunIds={remediatedSourceRunIds}
      onHistoryRefresh={async () => {
        const refreshed = await loadBuilderExecutionHistory()
        onHistoryChange(refreshed)
      }}
      onRequestCreated={queueRequest}
    />
    <div className="grid grid-cols-1 gap-4">

      {/* Assigned Work */}
      <div className="flex flex-col gap-2">
        <SectionLabel icon={Clock3} label="ASSIGNED WORK" accent={accent} />

        {surface.id === 'alex' && matchingPlan && (
          <WorkCard
            title="Current Builder plan"
            subtitle={matchingPlan.planSummary}
            meta={`${matchingPlan.target.targetLabel} · ${formatTimestamp(matchingPlan.createdAt)}`}
            badges={<InlineBadge label={matchingPlan.status} color="#00d4ff" background="rgba(0,212,255,0.08)" border="rgba(0,212,255,0.18)" />}
          />
        )}

        {surface.id === 'kai' && matchingPlan && (
          <WorkCard
            title="Plan-ready candidate"
            subtitle={matchingPlan.planSummary}
            meta={`${matchingPlan.target.targetLabel} · ${formatTimestamp(matchingPlan.createdAt)}`}
            badges={<InlineBadge label={matchingPlan.sourceLabel} color="#00d4ff" background="rgba(0,212,255,0.08)" border="rgba(0,212,255,0.18)" />}
          />
        )}

        {surface.id === 'kai' && matchingRequest && (
          <WorkCard
            title="Active request"
            subtitle={matchingRequest.planSummary}
            meta={`${matchingRequest.target.targetLabel} · requested ${formatTimestamp(matchingRequest.requestedAt)}`}
            badges={<InlineBadge label={matchingRequest.approvalState} color="#ffc84a" background="rgba(255,200,74,0.08)" border="rgba(255,200,74,0.18)" />}
          />
        )}

        {surface.id === 'kai' && matchingRun && (
          <WorkCard
            title="Live execution"
            subtitle={matchingRun.summary || matchingRun.note}
            meta={`${matchingRun.target.targetLabel} · started ${formatTimestamp(matchingRun.startedAt)}`}
            badges={<RunStatusBadge status={matchingRun.status} />}
          />
        )}

        {surface.id === 'maya' && verifiableRuns.slice(0, 2).map((entry) => (
          <WorkCard
            key={entry.runId}
            title={`Awaiting check · ${entry.runId}`}
            subtitle={entry.taskSummary}
            meta={`${entry.target.targetLabel} · finalized ${formatTimestamp(entry.finishedAt || entry.startedAt || entry.createdAt)}`}
            badges={<InlineBadge label="awaiting check" color="#00d4ff" background="rgba(0,212,255,0.08)" border="rgba(0,212,255,0.18)" />}
          />
        ))}

        {(
          (surface.id === 'alex' && !matchingPlan) ||
          (surface.id === 'kai' && !matchingPlan && !matchingRequest && !matchingRun) ||
          (surface.id === 'maya' && verifiableRuns.length === 0 && verifiedRuns.length === 0) ||
          surface.id === 'researcher' ||
          surface.id === 'noah'
        ) && (
          <EmptyPanel title="Nothing assigned" note="No matching work for the current focus." />
        )}
      </div>

      {/* Started Runs — history-derived; visible after batch start */}
      {surface.id === 'kai' && (
        <div className="flex flex-col gap-2">
          <SectionLabel
            icon={PlayCircle}
            label={startedHistoryRuns.length > 0 ? `STARTED RUNS · ${startedHistoryRuns.length}` : 'STARTED RUNS'}
            accent={accent}
          />
          {startedHistoryRuns.length > 0 ? (
            startedHistoryRuns.map((entry) => (
              <WorkCard
                key={entry.runId}
                title={entry.taskSummary || `Run ${entry.runId}`}
                subtitle={entry.note || 'Run started — awaiting finalization.'}
                meta={`${entry.target.targetLabel} · started ${formatTimestamp(entry.startedAt || entry.createdAt)}`}
                badges={
                  <InlineBadge
                    label="started"
                    color="#00d4ff"
                    background="rgba(0,212,255,0.08)"
                    border="rgba(0,212,255,0.18)"
                  />
                }
              >
                <button
                  type="button"
                  onClick={() => setSelectedRun(entry)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-mono tracking-[0.14em]"
                  style={{
                    color:      'rgba(0,212,255,0.75)',
                    background: 'rgba(0,212,255,0.06)',
                    border:     '1px solid rgba(0,212,255,0.15)',
                    cursor:     'pointer',
                  }}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  VIEW
                </button>
              </WorkCard>
            ))
          ) : (
            <EmptyPanel
              icon={PlayCircle}
              title="No other started runs"
              note="Runs started via the bridge that are not the current active run will appear here."
            />
          )}
        </div>
      )}

      {/* Recent Outcomes */}
      <div className="flex flex-col gap-2">
        <SectionLabel icon={FileCheck2} label="RECENT OUTCOMES" accent={accent} />

        {surface.id === 'maya' && verifiedRuns.map((entry) => (
          <WorkCard
            key={entry.runId}
            title={`Verified · ${entry.runId}`}
            subtitle={entry.verificationSummary || entry.summary || entry.note}
            meta={`${entry.target.targetLabel} · checked ${formatTimestamp(entry.checkedAt)}`}
            badges={
              <InlineBadge
                label={entry.verificationState ?? 'pending'}
                color={entry.verificationState === 'passed' ? '#00ff88' : '#ffc84a'}
                background={entry.verificationState === 'passed' ? 'rgba(0,255,136,0.08)' : 'rgba(255,200,74,0.08)'}
                border={entry.verificationState === 'passed' ? 'rgba(0,255,136,0.18)' : 'rgba(255,200,74,0.18)'}
              />
            }
          />
        ))}

        {(surface.id !== 'maya' ? recentOutcomes : recentOutcomes.filter((e) => !e.verificationState)).map((entry) => (
          <WorkCard
            key={entry.runId}
            title={`Builder run · ${entry.runId}`}
            subtitle={entry.summary || entry.taskSummary || entry.note}
            meta={`${entry.target.targetLabel} · ${formatTimestamp(entry.finishedAt || entry.startedAt || entry.createdAt)}`}
            badges={
              <InlineBadge
                label={entry.executionState}
                color={entry.executionState === 'completed' ? '#00ff88' : entry.executionState === 'started' ? '#00d4ff' : '#ffc84a'}
                background={entry.executionState === 'completed' ? 'rgba(0,255,136,0.08)' : entry.executionState === 'started' ? 'rgba(0,212,255,0.08)' : 'rgba(255,200,74,0.08)'}
                border={entry.executionState === 'completed' ? 'rgba(0,255,136,0.18)' : entry.executionState === 'started' ? 'rgba(0,212,255,0.18)' : 'rgba(255,200,74,0.18)'}
              />
            }
          />
        ))}

        {recentOutcomes.length === 0 && verifiedRuns.length === 0 && (
          <EmptyPanel title="No recent outcomes" note="Completed Builder runs for the current focus will appear here." />
        )}
      </div>
    </div>
    </>
  )
}
