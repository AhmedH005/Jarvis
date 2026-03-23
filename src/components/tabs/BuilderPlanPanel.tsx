import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, LoaderCircle, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import type { AgentOperationalData } from '@/adapters/agent-operations'
import { resolveBuilderExecutionSurface } from '@/adapters/builder-execution'
import { BUILDER_PLAN_SCOPE, resolveBuilderPlanSurface } from '@/adapters/builder-plan'
import { resolveExecutionRequestSurface } from '@/adapters/builder-execution-request'
import { useBuilderExecutionStore } from '@/store/builder-execution'
import { useBuilderExecutionRequestStore } from '@/store/builder-execution-request'
import { useBuilderPlanStore } from '@/store/builder-plan'
import { ItemList } from './shared'

function StatusPill({ label, tone }: { label: string; tone: 'info' | 'success' | 'warn' | 'neutral' }) {
  const config = {
    info: {
      color: 'rgba(0,212,255,0.84)',
      background: 'rgba(0,212,255,0.08)',
      border: 'rgba(0,212,255,0.18)',
    },
    success: {
      color: 'rgba(0,255,136,0.82)',
      background: 'rgba(0,255,136,0.08)',
      border: 'rgba(0,255,136,0.18)',
    },
    warn: {
      color: 'rgba(255,200,74,0.82)',
      background: 'rgba(255,200,74,0.08)',
      border: 'rgba(255,200,74,0.18)',
    },
    neutral: {
      color: 'rgba(192,232,240,0.56)',
      background: 'rgba(192,232,240,0.04)',
      border: 'rgba(192,232,240,0.12)',
    },
  } as const

  const colors = config[tone]

  return (
    <span
      className="rounded px-2 py-1 text-[9px] font-mono tracking-[0.14em]"
      style={{
        color: colors.color,
        background: colors.background,
        border: `1px solid ${colors.border}`,
      }}
    >
      {label.toUpperCase()}
    </span>
  )
}

function planStatusTone(status: 'plan-ready' | 'blocked'): 'success' | 'warn' {
  return status === 'plan-ready' ? 'success' : 'warn'
}

function executionStatusTone(status: 'draft' | 'awaiting-approval' | 'approved' | 'denied' | 'blocked' | 'fallback-demo'): 'info' | 'success' | 'warn' | 'neutral' {
  if (status === 'approved') return 'success'
  if (status === 'awaiting-approval') return 'info'
  if (status === 'denied' || status === 'blocked' || status === 'fallback-demo') return 'warn'
  return 'neutral'
}

function approvalTone(state: 'not-submitted' | 'awaiting-approval' | 'approved' | 'denied' | 'blocked'): 'info' | 'success' | 'warn' | 'neutral' {
  if (state === 'approved') return 'success'
  if (state === 'awaiting-approval') return 'info'
  if (state === 'denied' || state === 'blocked') return 'warn'
  return 'neutral'
}

function executionRunTone(state: 'started' | 'completed' | 'blocked' | 'failed'): 'info' | 'success' | 'warn' {
  if (state === 'started') return 'info'
  if (state === 'completed') return 'success'
  return 'warn'
}

function verificationTone(state: 'passed' | 'failed' | 'not-run'): 'success' | 'warn' | 'neutral' {
  if (state === 'passed') return 'success'
  if (state === 'failed') return 'warn'
  return 'neutral'
}

function parseLineItems(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function BuilderPlanPanel({ agent }: { agent: AgentOperationalData }) {
  const prompt = useBuilderPlanStore((s) => s.prompt)
  const phase = useBuilderPlanStore((s) => s.phase)
  const result = useBuilderPlanStore((s) => s.result)
  const error = useBuilderPlanStore((s) => s.error)
  const setPrompt = useBuilderPlanStore((s) => s.setPrompt)
  const submitPlan = useBuilderPlanStore((s) => s.submitPlan)
  const clearResult = useBuilderPlanStore((s) => s.clearResult)
  const requestPhase = useBuilderExecutionRequestStore((s) => s.phase)
  const pendingAction = useBuilderExecutionRequestStore((s) => s.pendingAction)
  const executionRequest = useBuilderExecutionRequestStore((s) => s.request)
  const requestError = useBuilderExecutionRequestStore((s) => s.error)
  const createRequestFromPlan = useBuilderExecutionRequestStore((s) => s.createRequestFromPlan)
  const settleRequest = useBuilderExecutionRequestStore((s) => s.settleRequest)
  const clearRequest = useBuilderExecutionRequestStore((s) => s.clearRequest)
  const executionPhase = useBuilderExecutionStore((s) => s.phase)
  const executionPendingAction = useBuilderExecutionStore((s) => s.pendingAction)
  const executionRun = useBuilderExecutionStore((s) => s.run)
  const executionError = useBuilderExecutionStore((s) => s.error)
  const startExecution = useBuilderExecutionStore((s) => s.startExecution)
  const finalizeExecution = useBuilderExecutionStore((s) => s.finalizeExecution)
  const clearRun = useBuilderExecutionStore((s) => s.clearRun)
  const [finalOutcome, setFinalOutcome] = useState<'completed' | 'blocked' | 'failed'>('completed')
  const [finalSummary, setFinalSummary] = useState('')
  const [filesChangedInput, setFilesChangedInput] = useState('')
  const [commandsRunInput, setCommandsRunInput] = useState('')
  const [verificationStatus, setVerificationStatus] = useState<'passed' | 'failed' | 'not-run'>('not-run')
  const [verificationSummary, setVerificationSummary] = useState('')

  const surface = useMemo(() => resolveBuilderPlanSurface(), [])
  const executionSurface = useMemo(() => resolveExecutionRequestSurface(), [])
  const executionStartSurface = useMemo(() => resolveBuilderExecutionSurface(), [])
  const canSubmit = prompt.trim().length > 0 && phase !== 'loading'
  const canCreateRequest = result?.status === 'plan-ready' && requestPhase !== 'loading'
  const isLoading = phase === 'loading'
  const isRequestLoading = requestPhase === 'loading'
  const canApproveOrDeny = executionRequest?.approvalState === 'awaiting-approval' && requestPhase !== 'loading'
  const isExecutionLoading = executionPhase === 'loading'
  const isExecutionStarting = executionPendingAction === 'start' && executionPhase === 'loading'
  const isExecutionFinalizing = executionPendingAction === 'finalize' && executionPhase === 'loading'
  const canStartExecution = executionRequest?.approvalState === 'approved'
    && executionPhase !== 'loading'
    && !executionRun
  const canFinalizeExecution = executionRun?.executionState === 'started'
    && executionPhase !== 'loading'
    && finalSummary.trim().length > 0

  useEffect(() => {
    if (!executionRun || executionRun.executionState !== 'started') {
      setFinalOutcome('completed')
      setFinalSummary('')
      setFilesChangedInput('')
      setCommandsRunInput('')
      setVerificationStatus('not-run')
      setVerificationSummary('')
    }
  }, [executionRun?.runId, executionRun?.executionState])

  const handleSubmitPlan = () => {
    clearRequest()
    clearRun()
    void submitPlan()
  }

  const handleCreateExecutionRequest = () => {
    if (!result || result.status !== 'plan-ready') return
    clearRun()
    void createRequestFromPlan(result)
  }

  const handleClearPlan = () => {
    clearRequest()
    clearRun()
    clearResult()
  }

  const handleClearRequest = () => {
    clearRequest()
    clearRun()
  }

  const handleApproveRequest = () => {
    void settleRequest('approve')
  }

  const handleDenyRequest = () => {
    void settleRequest('deny')
  }

  const handleStartExecution = () => {
    if (!executionRequest) return
    void startExecution(executionRequest)
  }

  const handleFinalizeExecution = () => {
    if (!executionRun || executionRun.executionState !== 'started') return

    void finalizeExecution({
      outcome: finalOutcome,
      summary: finalSummary.trim(),
      filesChanged: parseLineItems(filesChangedInput),
      commandsRun: parseLineItems(commandsRunInput),
      verificationStatus,
      verificationSummary: verificationSummary.trim() || undefined,
    })
  }

  return (
    <div
      className="rounded px-3 py-3"
      style={{
        background: 'rgba(4,10,18,0.62)',
        border: '1px solid rgba(0,255,136,0.1)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
            <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
              BUILDER PLAN + REQUEST SURFACE
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
            Start a safe Builder planning pass from the card, then package a scoped approval-gated request. Execution reporting stays explicit and never overclaims streaming or Checker results.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusPill label={agent.status} tone="success" />
          <StatusPill label={surface.sourceLabel} tone={surface.source === 'real-bridge' ? 'success' : 'warn'} />
        </div>
      </div>

      <div
        className="mt-3 rounded px-3 py-2"
        style={{
          background: 'rgba(255,200,74,0.04)',
          border: '1px solid rgba(255,200,74,0.14)',
        }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3 w-3" style={{ color: '#ffc84a' }} />
          <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(255,200,74,0.72)' }}>
            CURRENT TRUTH
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
          {surface.note}
        </p>
        <p className="mt-1 text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.64)' }}>
          {executionSurface.note}
        </p>
        <p className="mt-1 text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.52)' }}>
          {executionStartSurface.note}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label
            htmlFor="builder-plan-task"
            className="mb-2 block text-[9px] font-mono tracking-[0.16em]"
            style={{ color: 'rgba(0,212,255,0.62)' }}
          >
            TASK PROMPT
          </label>
          <textarea
            id="builder-plan-task"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="Describe the Jarvis repo task you want the Builder to plan."
            className="w-full resize-none rounded px-3 py-2 text-[11px] leading-snug outline-none"
            style={{
              color: 'rgba(192,232,240,0.9)',
              background: 'rgba(0,212,255,0.03)',
              border: '1px solid rgba(0,212,255,0.14)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill label={BUILDER_PLAN_SCOPE} tone="neutral" />
            <StatusPill label="plan-only" tone="info" />
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:justify-end">
          <button
            type="button"
            onClick={handleSubmitPlan}
            disabled={!canSubmit}
            className="rounded px-4 py-2 text-[10px] font-mono tracking-[0.16em]"
            style={{
              color: canSubmit ? '#00ff88' : 'rgba(0,255,136,0.28)',
              background: canSubmit ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)',
              border: `1px solid ${canSubmit ? 'rgba(0,255,136,0.2)' : 'rgba(0,255,136,0.08)'}`,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              minWidth: 142,
            }}
          >
            {isLoading ? 'PLANNING…' : 'PLAN TASK'}
          </button>

          <button
            type="button"
            onClick={handleCreateExecutionRequest}
            disabled={!canCreateRequest}
            className="rounded px-4 py-2 text-[10px] font-mono tracking-[0.16em]"
            style={{
              color: canCreateRequest ? '#00d4ff' : 'rgba(192,232,240,0.28)',
              background: canCreateRequest ? 'rgba(0,212,255,0.06)' : 'rgba(192,232,240,0.02)',
              border: `1px solid ${canCreateRequest ? 'rgba(0,212,255,0.18)' : 'rgba(192,232,240,0.08)'}`,
              cursor: canCreateRequest ? 'pointer' : 'not-allowed',
              minWidth: 142,
            }}
          >
            {isRequestLoading ? 'REQUESTING…' : 'CREATE EXECUTION REQUEST'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div
          className="mt-3 flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: 'rgba(0,212,255,0.03)',
            border: '1px solid rgba(0,212,255,0.1)',
          }}
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" style={{ color: '#00d4ff' }} />
          <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.72)' }}>
            Building a plan-only report. No execution is happening.
          </p>
        </div>
      )}

      {error && (
        <div
          className="mt-3 rounded px-3 py-2"
          style={{
            background: 'rgba(255,107,53,0.05)',
            border: '1px solid rgba(255,107,53,0.16)',
          }}
        >
          <p className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.84)' }}>
            {error}
          </p>
        </div>
      )}

      {requestError && (
        <div
          className="mt-3 rounded px-3 py-2"
          style={{
            background: 'rgba(255,107,53,0.05)',
            border: '1px solid rgba(255,107,53,0.16)',
          }}
        >
          <p className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.84)' }}>
            {requestError}
          </p>
        </div>
      )}

      {executionError && (
        <div
          className="mt-3 rounded px-3 py-2"
          style={{
            background: 'rgba(255,107,53,0.05)',
            border: '1px solid rgba(255,107,53,0.16)',
          }}
        >
          <p className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.84)' }}>
            {executionError}
          </p>
        </div>
      )}

      {result && (
        <details
          open
          className="mt-3 rounded"
          style={{
            background: 'rgba(0,212,255,0.02)',
            border: '1px solid rgba(0,212,255,0.1)',
          }}
        >
          <summary
            className="cursor-pointer px-3 py-3"
            style={{ listStyle: 'none' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.68)' }}>
                    PLAN RESULT
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
                    {formatTimestamp(result.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.88)' }}>
                  {result.taskPrompt}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusPill label={result.status} tone={planStatusTone(result.status)} />
                <StatusPill label={result.target.targetLabel} tone="info" />
                <StatusPill label={result.sourceLabel} tone={result.source === 'real-bridge' ? 'success' : 'warn'} />
              </div>
            </div>
          </summary>

          <div
            className="px-3 pb-3 pt-1"
            style={{ borderTop: '1px solid rgba(0,212,255,0.06)' }}
          >
            <div
              className="rounded px-3 py-2"
              style={{
                background: 'rgba(4,10,18,0.56)',
                border: '1px solid rgba(0,212,255,0.08)',
              }}
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />
                <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.62)' }}>
                  PLAN SUMMARY
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                {result.planSummary}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" style={{ color: '#00ff88' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                    LIKELY FILES
                  </span>
                </div>
                <ItemList items={result.likelyFiles.length > 0 ? result.likelyFiles : ['No likely files could be scoped honestly yet.']} color="#00ff88" />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" style={{ color: '#ffc84a' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(255,200,74,0.72)' }}>
                    ACCEPTANCE CRITERIA
                  </span>
                </div>
                <ItemList items={result.acceptanceCriteria} color="#ffc84a" />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <ClipboardList className="h-3 w-3" style={{ color: '#00d4ff' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.62)' }}>
                    VERIFICATION PATH
                  </span>
                </div>
                <ItemList items={result.verificationPath} color="#00d4ff" />
              </div>
            </div>

            <div
              className="mt-3 rounded px-3 py-2"
              style={{
                background: 'rgba(255,200,74,0.04)',
                border: '1px solid rgba(255,200,74,0.14)',
              }}
            >
              <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
                {result.note}
              </p>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleClearPlan}
                className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                style={{
                  color: 'rgba(192,232,240,0.66)',
                  background: 'rgba(192,232,240,0.03)',
                  border: '1px solid rgba(192,232,240,0.1)',
                }}
              >
                CLEAR PLAN
              </button>
            </div>
          </div>
        </details>
      )}

      {isRequestLoading && (
        <div
          className="mt-3 flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: 'rgba(0,212,255,0.03)',
            border: '1px solid rgba(0,212,255,0.1)',
          }}
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" style={{ color: '#00d4ff' }} />
          <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.72)' }}>
            {pendingAction === 'create'
              ? 'Packaging an approval-gated execution request. No execution is happening.'
              : `Settling Builder approval as ${(pendingAction ?? 'pending').toUpperCase()}. No execution is happening.`}
          </p>
        </div>
      )}

      {executionRequest && (
        <details
          open
          className="mt-3 rounded"
          style={{
            background: 'rgba(0,255,136,0.02)',
            border: '1px solid rgba(0,255,136,0.1)',
          }}
        >
          <summary
            className="cursor-pointer px-3 py-3"
            style={{ listStyle: 'none' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                    EXECUTION REQUEST
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
                    {formatTimestamp(executionRequest.requestedAt)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.88)' }}>
                  {executionRequest.taskPrompt}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusPill label={executionRequest.status} tone={executionStatusTone(executionRequest.status)} />
                <StatusPill label={executionRequest.approvalState} tone={approvalTone(executionRequest.approvalState)} />
                <StatusPill label={executionRequest.target.targetLabel} tone="info" />
                <StatusPill
                  label={executionRequest.sourceLabel}
                  tone={executionRequest.source === 'real-bridge' ? 'success' : 'warn'}
                />
              </div>
            </div>
          </summary>

          <div
            className="px-3 pb-3 pt-1"
            style={{ borderTop: '1px solid rgba(0,255,136,0.06)' }}
          >
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  APPROVAL STATE
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRequest.approvalState}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  EXECUTION MODE
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRequest.executionMode}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  SCOPE
                </p>
                <p className="mt-1 text-[10px] font-mono break-all" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRequest.scope}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  SOURCE LABEL
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRequest.sourceLabel}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  SETTLED AT
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRequest.settledAt ? formatTimestamp(executionRequest.settledAt) : 'pending'}
                </p>
              </div>
            </div>

            <div
              className="mt-3 rounded px-3 py-2"
              style={{
                background: 'rgba(4,10,18,0.56)',
                border: '1px solid rgba(0,255,136,0.08)',
              }}
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  REQUEST SUMMARY
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                {executionRequest.planSummary}
              </p>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Wrench className="h-3 w-3" style={{ color: '#00ff88' }} />
                <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  LIKELY FILES
                </span>
              </div>
              <ItemList
                items={executionRequest.likelyFiles.length > 0 ? executionRequest.likelyFiles : ['No likely files were scoped for this request.']}
                color="#00ff88"
              />
            </div>

            <div
              className="mt-3 rounded px-3 py-2"
              style={{
                background: 'rgba(255,200,74,0.04)',
                border: '1px solid rgba(255,200,74,0.14)',
              }}
            >
              <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
                {executionRequest.note}
              </p>
              <p className="mt-1 text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.64)' }}>
                No execution has happened yet on this surface. Approval state here only reflects the current request record.
              </p>
            </div>

            {executionRequest.approvalState === 'awaiting-approval' && (
              <div
                className="mt-3 rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                      APPROVAL ACTIONS
                    </p>
                    <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
                      This settles the local request state only. It does not start execution.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleApproveRequest}
                      disabled={!canApproveOrDeny}
                      className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                      style={{
                        color: canApproveOrDeny ? '#00ff88' : 'rgba(0,255,136,0.28)',
                        background: canApproveOrDeny ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)',
                        border: `1px solid ${canApproveOrDeny ? 'rgba(0,255,136,0.18)' : 'rgba(0,255,136,0.08)'}`,
                        cursor: canApproveOrDeny ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {pendingAction === 'approve' ? 'APPROVING…' : 'APPROVE'}
                    </button>

                    <button
                      type="button"
                      onClick={handleDenyRequest}
                      disabled={!canApproveOrDeny}
                      className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                      style={{
                        color: canApproveOrDeny ? '#ffc84a' : 'rgba(255,200,74,0.28)',
                        background: canApproveOrDeny ? 'rgba(255,200,74,0.08)' : 'rgba(255,200,74,0.02)',
                        border: `1px solid ${canApproveOrDeny ? 'rgba(255,200,74,0.18)' : 'rgba(255,200,74,0.08)'}`,
                        cursor: canApproveOrDeny ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {pendingAction === 'deny' ? 'DENYING…' : 'DENY'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {executionRequest.approvalState === 'approved' && !executionRun && (
              <div
                className="mt-3 rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                      EXECUTION START
                    </p>
                    <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
                      Start one approved Builder run. This only acknowledges start and does not imply completion, streaming, or verification.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartExecution}
                    disabled={!canStartExecution}
                    className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                    style={{
                      color: canStartExecution ? '#00ff88' : 'rgba(0,255,136,0.28)',
                      background: canStartExecution ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)',
                      border: `1px solid ${canStartExecution ? 'rgba(0,255,136,0.18)' : 'rgba(0,255,136,0.08)'}`,
                      cursor: canStartExecution ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isExecutionLoading ? 'STARTING…' : 'START EXECUTION'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleClearRequest}
                className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                style={{
                  color: 'rgba(192,232,240,0.66)',
                  background: 'rgba(192,232,240,0.03)',
                  border: '1px solid rgba(192,232,240,0.1)',
                }}
              >
                CLEAR REQUEST
              </button>
            </div>
          </div>
        </details>
      )}

      {isExecutionLoading && (
        <div
          className="mt-3 flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: 'rgba(0,255,136,0.03)',
            border: '1px solid rgba(0,255,136,0.1)',
          }}
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" style={{ color: '#00ff88' }} />
          <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.72)' }}>
            {isExecutionStarting
              ? 'Starting one approved Builder run. Completion, streaming, and verification are not implied.'
              : 'Recording a terminal Builder result for an already started run. Streaming and Checker verification are still not implied.'}
          </p>
        </div>
      )}

      {executionRun && (
        <details
          open
          className="mt-3 rounded"
          style={{
            background: 'rgba(0,255,136,0.02)',
            border: '1px solid rgba(0,255,136,0.1)',
          }}
        >
          <summary
            className="cursor-pointer px-3 py-3"
            style={{ listStyle: 'none' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Wrench className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                    EXECUTION RUN
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
                    {formatTimestamp(executionRun.startedAt)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug font-mono" style={{ color: 'rgba(192,232,240,0.88)' }}>
                  {executionRun.runId}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusPill label={executionRun.status} tone={executionRunTone(executionRun.status)} />
                <StatusPill label={executionRun.target.targetLabel} tone="info" />
                <StatusPill
                  label={executionRun.sourceLabel}
                  tone={executionRun.source === 'real-bridge' ? 'success' : 'warn'}
                />
              </div>
            </div>
          </summary>

          <div
            className="px-3 pb-3 pt-1"
            style={{ borderTop: '1px solid rgba(0,255,136,0.06)' }}
          >
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  RUN ID
                </p>
                <p className="mt-1 text-[10px] font-mono break-all" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRun.runId}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  REQUEST ID
                </p>
                <p className="mt-1 text-[10px] font-mono break-all" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRun.requestId}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  EXECUTION STATE
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRun.executionState}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  VERIFICATION
                </p>
                <div className="mt-1">
                  <StatusPill label={executionRun.verificationStatus} tone={verificationTone(executionRun.verificationStatus)} />
                </div>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  STARTED AT
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {formatTimestamp(executionRun.startedAt)}
                </p>
              </div>

              <div
                className="rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                  FINISHED AT
                </p>
                <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {executionRun.finishedAt ? formatTimestamp(executionRun.finishedAt) : 'pending'}
                </p>
              </div>
            </div>

            {executionRun.executionState === 'started' && (
              <div
                className="mt-3 rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                    FINALIZE EXECUTION REPORT
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
                  Record one terminal outcome for this started run. Leave files and commands empty if they are unknown.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <label className="block">
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.66)' }}>
                      OUTCOME
                    </span>
                    <select
                      value={finalOutcome}
                      onChange={(event) => setFinalOutcome(event.target.value as 'completed' | 'blocked' | 'failed')}
                      className="mt-2 w-full rounded px-3 py-2 text-[10px] outline-none"
                      style={{
                        color: 'rgba(192,232,240,0.9)',
                        background: 'rgba(0,255,136,0.03)',
                        border: '1px solid rgba(0,255,136,0.14)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      <option value="completed">completed</option>
                      <option value="blocked">blocked</option>
                      <option value="failed">failed</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.66)' }}>
                      VERIFICATION STATUS
                    </span>
                    <select
                      value={verificationStatus}
                      onChange={(event) => setVerificationStatus(event.target.value as 'passed' | 'failed' | 'not-run')}
                      className="mt-2 w-full rounded px-3 py-2 text-[10px] outline-none"
                      style={{
                        color: 'rgba(192,232,240,0.9)',
                        background: 'rgba(0,255,136,0.03)',
                        border: '1px solid rgba(0,255,136,0.14)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      <option value="not-run">not-run</option>
                      <option value="passed">passed</option>
                      <option value="failed">failed</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <label className="block xl:col-span-2">
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.66)' }}>
                      SUMMARY
                    </span>
                    <textarea
                      value={finalSummary}
                      onChange={(event) => setFinalSummary(event.target.value)}
                      rows={3}
                      placeholder="Required. Record what actually happened in this run."
                      className="mt-2 w-full resize-none rounded px-3 py-2 text-[10px] leading-snug outline-none"
                      style={{
                        color: 'rgba(192,232,240,0.9)',
                        background: 'rgba(0,255,136,0.03)',
                        border: '1px solid rgba(0,255,136,0.14)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.66)' }}>
                      FILES CHANGED
                    </span>
                    <textarea
                      value={filesChangedInput}
                      onChange={(event) => setFilesChangedInput(event.target.value)}
                      rows={3}
                      placeholder="Optional. One repo-relative path per line."
                      className="mt-2 w-full resize-none rounded px-3 py-2 text-[10px] leading-snug outline-none"
                      style={{
                        color: 'rgba(192,232,240,0.9)',
                        background: 'rgba(0,255,136,0.03)',
                        border: '1px solid rgba(0,255,136,0.14)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.66)' }}>
                      COMMANDS RUN
                    </span>
                    <textarea
                      value={commandsRunInput}
                      onChange={(event) => setCommandsRunInput(event.target.value)}
                      rows={3}
                      placeholder="Optional. One command per line."
                      className="mt-2 w-full resize-none rounded px-3 py-2 text-[10px] leading-snug outline-none"
                      style={{
                        color: 'rgba(192,232,240,0.9)',
                        background: 'rgba(0,255,136,0.03)',
                        border: '1px solid rgba(0,255,136,0.14)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    />
                  </label>

                  <label className="block xl:col-span-2">
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.66)' }}>
                      VERIFICATION SUMMARY
                    </span>
                    <textarea
                      value={verificationSummary}
                      onChange={(event) => setVerificationSummary(event.target.value)}
                      rows={2}
                      placeholder="Optional. Leave blank if verification was not run or there is nothing useful to add."
                      className="mt-2 w-full resize-none rounded px-3 py-2 text-[10px] leading-snug outline-none"
                      style={{
                        color: 'rgba(192,232,240,0.9)',
                        background: 'rgba(0,255,136,0.03)',
                        border: '1px solid rgba(0,255,136,0.14)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.72)' }}>
                    Finalization records a terminal result for this run. It does not imply streaming or Checker verification.
                  </p>
                  <button
                    type="button"
                    onClick={handleFinalizeExecution}
                    disabled={!canFinalizeExecution}
                    className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                    style={{
                      color: canFinalizeExecution ? '#00ff88' : 'rgba(0,255,136,0.28)',
                      background: canFinalizeExecution ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)',
                      border: `1px solid ${canFinalizeExecution ? 'rgba(0,255,136,0.18)' : 'rgba(0,255,136,0.08)'}`,
                      cursor: canFinalizeExecution ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isExecutionFinalizing ? 'FINALIZING…' : 'FINALIZE RUN'}
                  </button>
                </div>
              </div>
            )}

            {executionRun.summary && (
              <div
                className="mt-3 rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                    EXECUTION SUMMARY
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                  {executionRun.summary}
                </p>
              </div>
            )}

            {(executionRun.filesChanged.length > 0 || executionRun.commandsRun.length > 0) && (
              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Wrench className="h-3 w-3" style={{ color: '#00ff88' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                      FILES CHANGED
                    </span>
                  </div>
                  <ItemList
                    items={executionRun.filesChanged.length > 0 ? executionRun.filesChanged : ['No changed files were reported for this run.']}
                    color="#00ff88"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3" style={{ color: '#00d4ff' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.62)' }}>
                      COMMANDS RUN
                    </span>
                  </div>
                  <ItemList
                    items={executionRun.commandsRun.length > 0 ? executionRun.commandsRun : ['No commands were reported for this run.']}
                    color="#00d4ff"
                  />
                </div>
              </div>
            )}

            {executionRun.verificationSummary && (
              <div
                className="mt-3 rounded px-3 py-2"
                style={{
                  background: 'rgba(4,10,18,0.56)',
                  border: '1px solid rgba(0,255,136,0.08)',
                }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#ffc84a' }} />
                  <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(255,200,74,0.72)' }}>
                    VERIFICATION SUMMARY
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                  {executionRun.verificationSummary}
                </p>
              </div>
            )}

            <div
              className="mt-3 rounded px-3 py-2"
              style={{
                background: 'rgba(255,200,74,0.04)',
                border: '1px solid rgba(255,200,74,0.14)',
              }}
            >
              <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
                {executionRun.note}
              </p>
              <p className="mt-1 text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.64)' }}>
                {executionRun.executionState === 'started'
                  ? 'This is only a start acknowledgement. Streaming, completion, and Checker verification are still not implemented.'
                  : 'This is a recorded terminal result for one Builder run. Checker verification is still separate, and rerun/restart flows are still not implemented.'}
              </p>
            </div>
          </div>
        </details>
      )}
    </div>
  )
}
