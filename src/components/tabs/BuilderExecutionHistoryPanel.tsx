import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ExternalLink,
  FileCode2,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from 'lucide-react'
import type {
  BuilderExecutionHistoryEntry,
  BuilderExecutionHistorySnapshot,
} from '@/adapters/builder-execution'
import { createBuilderRemediationRequest } from '@/adapters/builder-execution-request'
import { getBuilderProvider } from '@/integrations/registry/providerRegistry'
import { useBuilderExecutionRequestStore } from '@/store/builder-execution-request'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import { ActionChip, CountBadge, EmptyPanel, FieldRow, PanelHeader } from './shared'
import { RunDetailDrawer } from './RunDetailDrawer'

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

function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: 'info' | 'success' | 'warn' | 'neutral'
}) {
  const config = {
    info:    { color: '#00d4ff',               bg: 'rgba(0,212,255,0.08)',    border: 'rgba(0,212,255,0.24)'    },
    success: { color: '#00ff88',               bg: 'rgba(0,255,136,0.08)',    border: 'rgba(0,255,136,0.24)'    },
    warn:    { color: '#ffc84a',               bg: 'rgba(255,200,74,0.08)',   border: 'rgba(255,200,74,0.24)'   },
    neutral: { color: 'rgba(192,232,240,0.7)', bg: 'rgba(192,232,240,0.04)', border: 'rgba(192,232,240,0.14)'  },
  } as const

  const colors = config[tone]

  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-mono tracking-[0.16em]"
      style={{
        color:      colors.color,
        background: colors.bg,
        border:     `1px solid ${colors.border}`,
      }}
    >
      {label.toUpperCase()}
    </span>
  )
}

function executionTone(state: BuilderExecutionHistoryEntry['executionState']): 'info' | 'success' | 'warn' {
  if (state === 'started')   return 'info'
  if (state === 'completed') return 'success'
  return 'warn'
}

function approvalTone(state: BuilderExecutionHistoryEntry['approvalState']): 'info' | 'success' | 'warn' {
  if (state === 'approved')          return 'success'
  if (state === 'awaiting-approval') return 'info'
  return 'warn'
}

function verificationTone(
  state: BuilderExecutionHistoryEntry['verificationStatus']
): 'success' | 'warn' | 'neutral' {
  if (state === 'passed') return 'success'
  if (state === 'failed') return 'warn'
  return 'neutral'
}

function checkerTone(
  state: BuilderExecutionHistoryEntry['verificationState']
): 'success' | 'warn' | 'neutral' {
  if (state === 'passed') return 'success'
  if (state === 'failed' || state === 'blocked') return 'warn'
  return 'neutral'
}

type HistoryTargetTypeFilter = 'all' | BuilderExecutionHistoryEntry['target']['targetType']

function collectTargetOptions(
  entries: BuilderExecutionHistoryEntry[],
  targetTypeFilter: HistoryTargetTypeFilter
): Array<{ id: string; label: string }> {
  const options = new Map<string, string>()

  for (const entry of entries) {
    if (targetTypeFilter !== 'all' && entry.target.targetType !== targetTypeFilter) continue
    if (!options.has(entry.target.targetId)) {
      options.set(entry.target.targetId, entry.target.targetLabel)
    }
  }

  return Array.from(options.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

async function loadHistoryFromProvider(): Promise<BuilderExecutionHistorySnapshot> {
  const result = await getBuilderProvider().loadHistory()
  if (!result.ok || !result.data) {
    throw new Error(result.failure?.message ?? result.summary)
  }
  return result.data
}

function MonoList({
  icon: Icon,
  title,
  items,
  accent,
}: {
  icon: typeof FileCode2
  title: string
  items: string[]
  accent: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" style={{ color: accent }} />
        <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: accent }}>
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <code
            key={`${title}-${item}`}
            className="rounded-lg px-2 py-1 text-[10px] leading-snug"
            style={{
              color:      'rgba(192,232,240,0.82)',
              background: 'rgba(4,10,18,0.72)',
              border:     '1px solid rgba(0,212,255,0.08)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              wordBreak:  'break-word',
            }}
          >
            {item}
          </code>
        ))}
      </div>
    </div>
  )
}

function BuilderExecutionHistoryRow({
  entry,
  onVerify,
  onRemediate,
  onView,
}: {
  entry: BuilderExecutionHistoryEntry
  onVerify: (runId: string, verificationPrompt?: string) => Promise<{ note: string }>
  onRemediate: (
    entry: BuilderExecutionHistoryEntry,
    remediationPrompt: string
  ) => Promise<{ note: string }>
  onView: (entry: BuilderExecutionHistoryEntry) => void
}) {
  const navigateToAgent = useMissionHandoffStore((s) => s.navigateToAgent)
  const [expanded, setExpanded]                     = useState(false)
  const [verificationPrompt, setVerificationPrompt] = useState('')
  const [remediationPrompt, setRemediationPrompt]   = useState('')
  const [pending, setPending]                       = useState(false)
  const [remediationPending, setRemediationPending] = useState(false)
  const [feedback, setFeedback]                     = useState<string | null>(null)
  const [remediationFeedback, setRemediationFeedback] = useState<string | null>(null)

  const canVerify = entry.executionState !== 'started' && !entry.verificationState && !pending
  const canRemediate =
    (entry.executionState === 'failed' || entry.executionState === 'blocked') &&
    remediationPrompt.trim().length > 0 &&
    !remediationPending

  const showVerifyChip    = entry.executionState !== 'started' && !entry.verificationState
  const showRemediateChip = entry.executionState === 'failed' || entry.executionState === 'blocked'

  useEffect(() => {
    setFeedback(null)
    setRemediationFeedback(null)
  }, [entry.runId, entry.checkedAt, entry.verificationState, entry.sourceRunId, entry.remediationKind])

  const handleVerify = async () => {
    setPending(true)
    setFeedback(null)
    try {
      const result = await onVerify(entry.runId, verificationPrompt.trim() || undefined)
      setFeedback(result.note)
      setVerificationPrompt('')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Checker verification failed.')
    } finally {
      setPending(false)
    }
  }

  const handleRemediate = async () => {
    setRemediationPending(true)
    setRemediationFeedback(null)
    try {
      const result = await onRemediate(entry, remediationPrompt.trim())
      setRemediationFeedback(result.note)
      setRemediationPrompt('')
    } catch (error) {
      setRemediationFeedback(
        error instanceof Error ? error.message : 'Remediation request failed.'
      )
    } finally {
      setRemediationPending(false)
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(4,10,18,0.62)',
        border:     '1px solid rgba(0,255,136,0.08)',
      }}
    >
      {/* ── Summary row ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        className="w-full px-4 py-3 text-left"
        style={{ cursor: 'pointer', background: 'transparent' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: 'rgba(0,255,136,0.68)' }}>
                BUILDER RUN
              </span>
              <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
                {formatTimestamp(entry.finishedAt || entry.startedAt || entry.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.9)' }}>
              {entry.taskSummary || 'No task summary was retained for this run.'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ActionChip
                label="VIEW"
                Icon={ExternalLink}
                accent="rgba(192,232,240,0.65)"
                capability="navigational"
                feedbackNote="Opening…"
                onClick={() => onView(entry)}
              />
              {showVerifyChip && (
                <ActionChip
                  label="VERIFY"
                  Icon={ShieldCheck}
                  accent="#00d4ff"
                  capability="navigational"
                  feedbackNote="Opening Maya…"
                  onClick={() => navigateToAgent('maya')}
                />
              )}
              {showRemediateChip && (
                <ActionChip
                  label="REMEDIATE"
                  Icon={Wrench}
                  accent="#00ff88"
                  capability="navigational"
                  feedbackNote="Opening Kai…"
                  onClick={() => navigateToAgent('kai')}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <StatusBadge label={entry.executionState} tone={executionTone(entry.executionState)} />
            <StatusBadge label={entry.target.targetLabel} tone="neutral" />
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.16 }}
              className="mt-0.5"
            >
              <ChevronDown className="h-3 w-3" style={{ color: 'rgba(192,232,240,0.30)' }} />
            </motion.div>
          </div>
        </div>
      </button>

      {/* ── Expanded detail ──────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-4 pb-4 pt-3"
              style={{ borderTop: '1px solid rgba(0,255,136,0.06)' }}
            >
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                <FieldRow label="Run ID"     value={entry.runId}               mono />
                <FieldRow label="Request ID" value={entry.requestId}           mono />
                <FieldRow label="Created"    value={formatTimestamp(entry.createdAt)}  />
                <FieldRow label="Settled"    value={formatTimestamp(entry.settledAt)}  />
                <FieldRow label="Started"    value={formatTimestamp(entry.startedAt)}  />
                <FieldRow label="Finished"   value={formatTimestamp(entry.finishedAt)} />
                <FieldRow label="Checked"    value={formatTimestamp(entry.checkedAt)}  />
                <FieldRow label="Source Run" value={entry.sourceRunId ?? '—'}   mono />
                <FieldRow label="Remediation" value={entry.remediationKind ?? 'primary'} mono />
                <FieldRow label="Target"      value={entry.target.targetLabel}  mono />
                <FieldRow label="Target Paths" value={entry.target.targetPaths.join(', ') || '.'} mono />
              </div>

              {entry.sourceRunId && (
                <div
                  className="mt-3 rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(0,212,255,0.04)',
                    border:     '1px solid rgba(0,212,255,0.12)',
                  }}
                >
                  <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(0,212,255,0.78)' }}>
                    Follow-up to run {entry.sourceRunId} as {entry.remediationKind ?? 'fix-forward'}. The earlier run remains recorded separately.
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={`approval ${entry.approvalState}`}                    tone={approvalTone(entry.approvalState)} />
                <StatusBadge label={`builder verify ${entry.verificationStatus ?? 'not-run'}`} tone={verificationTone(entry.verificationStatus)} />
                <StatusBadge label={entry.verificationState ? `checker ${entry.verificationState}` : 'checker pending'} tone={checkerTone(entry.verificationState)} />
                <StatusBadge label={entry.sourceLabel} tone="success" />
                {entry.remediationKind && <StatusBadge label={entry.remediationKind} tone="info" />}
              </div>

              {entry.summary && (
                <div
                  className="mt-3 rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(4,10,18,0.56)',
                    border:     '1px solid rgba(0,255,136,0.08)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                      EXECUTION SUMMARY
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                    {entry.summary}
                  </p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
                <MonoList
                  icon={FileCode2}
                  title="LIKELY FILES"
                  items={entry.likelyFiles.length > 0 ? entry.likelyFiles : ['—']}
                  accent="#00ff88"
                />
                <MonoList
                  icon={Wrench}
                  title="FILES CHANGED"
                  items={entry.filesChanged.length > 0 ? entry.filesChanged : ['—']}
                  accent="#00d4ff"
                />
                <MonoList
                  icon={TerminalSquare}
                  title="COMMANDS RUN"
                  items={entry.commandsRun.length > 0 ? entry.commandsRun : ['—']}
                  accent="#ffc84a"
                />
              </div>

              {entry.builderVerificationSummary && (
                <div
                  className="mt-3 rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(4,10,18,0.56)',
                    border:     '1px solid rgba(255,200,74,0.12)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#ffc84a' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(255,200,74,0.72)' }}>
                      BUILDER VERIFICATION SUMMARY
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                    {entry.builderVerificationSummary}
                  </p>
                </div>
              )}

              {!entry.verificationState && entry.executionState !== 'started' && (
                <div
                  className="mt-3 rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(4,10,18,0.56)',
                    border:     '1px solid rgba(0,255,136,0.08)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                      MANUAL CHECKER REVIEW
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
                    Attach one manual Checker verdict to this finalized run. Reviews stored metadata only — nothing is re-executed.
                  </p>
                  <textarea
                    value={verificationPrompt}
                    onChange={(event) => setVerificationPrompt(event.target.value)}
                    rows={2}
                    placeholder="Optional review focus for Checker."
                    className="mt-3 w-full resize-none rounded-lg px-3 py-2 text-[10px] leading-snug outline-none"
                    style={{
                      color:      'rgba(192,232,240,0.9)',
                      background: 'rgba(0,255,136,0.03)',
                      border:     '1px solid rgba(0,255,136,0.14)',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[9px] font-mono" style={{ color: 'rgba(255,200,74,0.65)' }}>
                      Checker review stays separate from execution. No auto-remediation.
                    </p>
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={!canVerify}
                      className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                      style={{
                        color:      canVerify ? '#00ff88' : 'rgba(0,255,136,0.28)',
                        background: canVerify ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)',
                        border:     `1px solid ${canVerify ? 'rgba(0,255,136,0.18)' : 'rgba(0,255,136,0.08)'}`,
                        cursor:     canVerify ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {pending ? 'VERIFYING…' : 'VERIFY RUN'}
                    </button>
                  </div>
                </div>
              )}

              {(entry.executionState === 'failed' || entry.executionState === 'blocked') && (
                <div
                  className="mt-3 rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(4,10,18,0.56)',
                    border:     '1px solid rgba(0,212,255,0.08)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.68)' }}>
                      MANUAL REMEDIATION REQUEST
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
                    Package one explicit approval-gated follow-up request from this {entry.executionState} run.
                    Creates a new request only — never auto-approves or auto-starts execution.
                  </p>
                  <textarea
                    value={remediationPrompt}
                    onChange={(event) => setRemediationPrompt(event.target.value)}
                    rows={2}
                    placeholder="Required. Describe the manual follow-up fix-forward request."
                    className="mt-3 w-full resize-none rounded-lg px-3 py-2 text-[10px] leading-snug outline-none"
                    style={{
                      color:      'rgba(192,232,240,0.9)',
                      background: 'rgba(0,212,255,0.03)',
                      border:     '1px solid rgba(0,212,255,0.14)',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[9px] font-mono" style={{ color: 'rgba(255,200,74,0.65)' }}>
                      Target metadata is preserved from the source run.
                    </p>
                    <button
                      type="button"
                      onClick={handleRemediate}
                      disabled={!canRemediate}
                      className="rounded px-3 py-1.5 text-[9px] font-mono tracking-[0.16em]"
                      style={{
                        color:      canRemediate ? '#00d4ff' : 'rgba(0,212,255,0.28)',
                        background: canRemediate ? 'rgba(0,212,255,0.08)' : 'rgba(0,212,255,0.02)',
                        border:     `1px solid ${canRemediate ? 'rgba(0,212,255,0.18)' : 'rgba(0,212,255,0.08)'}`,
                        cursor:     canRemediate ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {remediationPending ? 'REQUESTING…' : 'CREATE REMEDIATION REQUEST'}
                    </button>
                  </div>
                  {remediationFeedback && (
                    <p className="mt-2 text-[10px] leading-snug font-mono" style={{ color: 'rgba(0,212,255,0.72)' }}>
                      {remediationFeedback}
                    </p>
                  )}
                </div>
              )}

              {entry.verificationSummary && (
                <div
                  className="mt-3 rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(4,10,18,0.56)',
                    border:     '1px solid rgba(0,255,136,0.12)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
                    <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.72)' }}>
                      CHECKER REVIEW SUMMARY
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.78)' }}>
                    {entry.verificationSummary}
                  </p>
                </div>
              )}

              <div
                className="mt-3 rounded-lg px-3 py-2"
                style={{
                  background: 'rgba(255,200,74,0.04)',
                  border:     '1px solid rgba(255,200,74,0.14)',
                }}
              >
                <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
                  {entry.note}
                </p>
                {feedback && (
                  <p className="mt-1 text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.64)' }}>
                    {feedback}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function BuilderExecutionHistoryPanel({
  history,
}: {
  history: BuilderExecutionHistorySnapshot
}) {
  const queueRequest = useBuilderExecutionRequestStore((state) => state.queueRequest)

  const [currentHistory, setCurrentHistory]     = useState(history)
  const [targetTypeFilter, setTargetTypeFilter] = useState<HistoryTargetTypeFilter>('all')
  const [targetIdFilter, setTargetIdFilter]     = useState('all')
  const [selectedRun, setSelectedRun]           = useState<BuilderExecutionHistoryEntry | null>(null)

  const remediatedRunIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of currentHistory.entries) {
      if (e.sourceRunId) ids.add(e.sourceRunId)
    }
    return ids
  }, [currentHistory.entries])

  const targetOptions = useMemo(
    () => collectTargetOptions(currentHistory.entries, targetTypeFilter),
    [currentHistory.entries, targetTypeFilter]
  )

  const filteredEntries = useMemo(
    () =>
      currentHistory.entries.filter((entry) => {
        if (targetTypeFilter !== 'all' && entry.target.targetType !== targetTypeFilter) return false
        if (targetIdFilter !== 'all' && entry.target.targetId !== targetIdFilter) return false
        return true
      }),
    [currentHistory.entries, targetIdFilter, targetTypeFilter]
  )

  useEffect(() => {
    setCurrentHistory(history)
  }, [history])

  useEffect(() => {
    if (targetIdFilter !== 'all' && !targetOptions.some((option) => option.id === targetIdFilter)) {
      setTargetIdFilter('all')
    }
  }, [targetIdFilter, targetOptions])

  const handleVerify = async (runId: string, verificationPrompt?: string) => {
    const result = await getBuilderProvider().verifyRun(runId, verificationPrompt)
    if (!result.ok || !result.data) {
      throw new Error(result.failure?.message ?? result.summary)
    }
    const refreshed = await loadHistoryFromProvider()
    setCurrentHistory(refreshed)
    return { note: result.data.note }
  }

  const handleRemediate = async (entry: BuilderExecutionHistoryEntry, remediationPrompt: string) => {
    const result = await createBuilderRemediationRequest(entry, remediationPrompt)
    if (result.status !== 'awaiting-approval') {
      return { note: result.note }
    }
    return {
      note: `Created ${result.remediationKind ?? 'fix-forward'} remediation request ${result.id} in state ${result.approvalState}. ${result.note}`,
    }
  }

  return (
    <>
    <RunDetailDrawer
      entry={selectedRun}
      onClose={() => setSelectedRun(null)}
      remediatedRunIds={remediatedRunIds}
      onHistoryRefresh={async () => {
        const refreshed = await loadHistoryFromProvider()
        setCurrentHistory(refreshed)
      }}
      onRequestCreated={queueRequest}
    />
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(4,10,18,0.65)',
        border:     '1px solid rgba(0,212,255,0.09)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PanelHeader
        Icon={TerminalSquare}
        iconColor="#00ff88"
        iconBg="rgba(0,255,136,0.09)"
        iconBorder="rgba(0,255,136,0.18)"
        title="EXECUTION HISTORY"
        sublabel="Canonical Builder runs"
        badge={<CountBadge count={filteredEntries.length} />}
        right={
          <StatusBadge
            label={currentHistory.sourceLabel}
            tone={currentHistory.source === 'real-bridge' ? 'success' : 'warn'}
          />
        }
      />

      {/* ── Blocked note ──────────────────────────────────────────── */}
      {currentHistory.status === 'blocked' && (
        <div className="px-5 pt-4">
          <div
            className="rounded-lg px-3 py-2.5"
            style={{
              background: 'rgba(255,200,74,0.06)',
              border:     '1px solid rgba(255,200,74,0.18)',
            }}
          >
            <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
              {currentHistory.note}
            </p>
          </div>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      {currentHistory.entries.length > 0 && (
        <div
          className="flex flex-wrap items-end gap-3 px-5 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[8px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.55)' }}>
              TARGET TYPE
            </span>
            <select
              value={targetTypeFilter}
              onChange={(event) => setTargetTypeFilter(event.target.value as HistoryTargetTypeFilter)}
              className="rounded-lg px-3 py-1.5 text-[10px] outline-none"
              style={{
                color:      'rgba(192,232,240,0.9)',
                background: 'rgba(0,255,136,0.03)',
                border:     '1px solid rgba(0,255,136,0.14)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                minWidth:   120,
              }}
            >
              <option value="all">all targets</option>
              <option value="app">app</option>
              <option value="package">package</option>
              <option value="docs">docs</option>
              <option value="repo">repo</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[8px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,255,136,0.55)' }}>
              TARGET ID
            </span>
            <select
              value={targetIdFilter}
              onChange={(event) => setTargetIdFilter(event.target.value)}
              disabled={targetOptions.length === 0}
              className="rounded-lg px-3 py-1.5 text-[10px] outline-none"
              style={{
                color:      targetOptions.length > 0 ? 'rgba(192,232,240,0.9)' : 'rgba(192,232,240,0.34)',
                background: 'rgba(0,255,136,0.03)',
                border:     '1px solid rgba(0,255,136,0.14)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                minWidth:   160,
              }}
            >
              <option value="all">all visible targets</option>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-1.5 pb-0.5">
            <StatusBadge label={targetTypeFilter === 'all' ? 'all types' : targetTypeFilter} tone="info" />
            {targetIdFilter !== 'all' && <StatusBadge label={targetIdFilter} tone="neutral" />}
          </div>
        </div>
      )}

      {/* ── Rows ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 py-4">
        {currentHistory.entries.length === 0 ? (
          <EmptyPanel
            icon={TerminalSquare}
            title="No runs yet."
            note="Execution runs appear here once an approved request is started through the real Builder bridge."
          />
        ) : filteredEntries.length === 0 ? (
          <EmptyPanel
            title="No runs match the current filter."
            note={`${currentHistory.entries.length} run${currentHistory.entries.length > 1 ? 's' : ''} exist under other filters.`}
          />
        ) : (
          filteredEntries.map((entry) => (
            <BuilderExecutionHistoryRow
              key={entry.runId}
              entry={entry}
              onVerify={handleVerify}
              onRemediate={handleRemediate}
              onView={setSelectedRun}
            />
          ))
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.28)' }}>
          Joined from real request and run records.
        </p>
      </div>
    </div>
    </>
  )
}
