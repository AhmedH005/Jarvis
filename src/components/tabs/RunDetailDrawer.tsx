import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileCode2,
  ShieldCheck,
  TerminalSquare,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import type { BuilderExecutionHistoryEntry } from '@/adapters/builder-execution'
import type { BuilderExecutionRequest } from '@/adapters/builder-execution-request'
import { createBuilderRemediationRequest } from '@/adapters/builder-execution-request'
import { verifyCheckerRun } from '@/adapters/checker'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(ts?: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

// ── Internal primitives ────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, label, accent }: {
  icon: typeof Wrench
  label: string
  accent: string
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="h-3 w-3 flex-shrink-0" style={{ color: accent }} />
      <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: accent }}>
        {label}
      </span>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="flex-shrink-0 text-[9px] font-mono w-20 text-right" style={{ color: 'rgba(192,232,240,0.38)' }}>
        {label}
      </span>
      <span className="text-[10px] font-mono leading-snug break-all" style={{ color: 'rgba(192,232,240,0.72)' }}>
        {value}
      </span>
    </div>
  )
}

function StatusPill({ label, color, bg, border }: {
  label: string; color: string; bg: string; border: string
}) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-mono tracking-[0.16em]"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      {label.toUpperCase()}
    </span>
  )
}

function MonoList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <code
          key={item}
          className="rounded-lg px-2.5 py-1.5 text-[10px] leading-snug break-all"
          style={{
            color:      'rgba(192,232,240,0.82)',
            background: 'rgba(4,10,18,0.72)',
            border:     '1px solid rgba(0,212,255,0.08)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {item}
        </code>
      ))}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border:     '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </div>
  )
}

function ActionBtn({ label, onClick, disabled, tone }: {
  label: string
  onClick: () => void
  disabled: boolean
  tone: 'success' | 'warn'
}) {
  const s = tone === 'success'
    ? { color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.18)' }
    : { color: '#ffc84a', bg: 'rgba(255,200,74,0.08)', border: 'rgba(255,200,74,0.18)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1.5 text-[10px] font-mono tracking-[0.16em]"
      style={{
        color:      disabled ? 'rgba(192,232,240,0.34)' : s.color,
        background: disabled ? 'rgba(255,255,255,0.03)' : s.bg,
        border:     `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : s.border}`,
        cursor:     disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function execTone(state: BuilderExecutionHistoryEntry['executionState']) {
  if (state === 'started')   return { color: '#00d4ff', bg: 'rgba(0,212,255,0.08)',   border: 'rgba(0,212,255,0.22)'   }
  if (state === 'completed') return { color: '#00ff88', bg: 'rgba(0,255,136,0.08)',   border: 'rgba(0,255,136,0.22)'   }
  return                            { color: '#ffc84a', bg: 'rgba(255,200,74,0.08)',  border: 'rgba(255,200,74,0.22)'  }
}

function checkerTone(state?: BuilderExecutionHistoryEntry['verificationState']) {
  if (state === 'passed')  return { color: '#00ff88', bg: 'rgba(0,255,136,0.08)',  border: 'rgba(0,255,136,0.22)'  }
  if (state === 'failed' || state === 'blocked') return { color: '#ffc84a', bg: 'rgba(255,200,74,0.08)', border: 'rgba(255,200,74,0.22)' }
  return                           { color: 'rgba(192,232,240,0.55)', bg: 'rgba(192,232,240,0.04)', border: 'rgba(192,232,240,0.14)' }
}

function verifyTone(state?: BuilderExecutionHistoryEntry['verificationStatus']) {
  if (state === 'passed') return { color: '#00ff88', bg: 'rgba(0,255,136,0.08)',  border: 'rgba(0,255,136,0.22)'  }
  if (state === 'failed') return { color: '#ffc84a', bg: 'rgba(255,200,74,0.08)', border: 'rgba(255,200,74,0.22)' }
  return                          { color: 'rgba(192,232,240,0.45)', bg: 'rgba(192,232,240,0.04)', border: 'rgba(192,232,240,0.12)' }
}

// ── Suggestion logic ──────────────────────────────────────────────────────────
// Pure function — no side effects, no AI, no heuristics.
// Returns the single most relevant next step for a run, or null if none applies.

export function deriveRunSuggestion(
  run: Pick<BuilderExecutionHistoryEntry, 'executionState' | 'verificationState'>
): 'remediate' | 'verify' | null {
  if (run.executionState === 'failed' || run.executionState === 'blocked') {
    return 'remediate'
  }
  if (run.executionState === 'completed' && !run.verificationState) {
    return 'verify'
  }
  return null
}

// ── Main export ────────────────────────────────────────────────────────────────

export function RunDetailDrawer({
  entry,
  onClose,
  remediatedRunIds = new Set<string>(),
  onHistoryRefresh,
  onRequestCreated,
}: {
  entry:   BuilderExecutionHistoryEntry | null
  onClose: () => void
  /** Run IDs that already have a remediation — used to suppress the REMEDIATE button. */
  remediatedRunIds?: ReadonlySet<string>
  /** Called after a successful VERIFY so the parent can refresh history. */
  onHistoryRefresh?: () => Promise<void>
  /** Called with the new request after a successful REMEDIATE. */
  onRequestCreated?: (request: BuilderExecutionRequest) => void
}) {
  // ── Action state ───────────────────────────────────────────────────────────
  const [verifyPhase,    setVerifyPhase]    = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [verifyNote,     setVerifyNote]     = useState('')
  const [remediatePhase, setRemediatePhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [remediateNote,  setRemediateNote]  = useState('')

  // Reset action state when the viewed entry changes
  useEffect(() => {
    setVerifyPhase('idle')
    setVerifyNote('')
    setRemediatePhase('idle')
    setRemediateNote('')
  }, [entry?.runId])

  // Close on Escape
  useEffect(() => {
    if (!entry) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [entry, onClose])

  // ── Eligibility ────────────────────────────────────────────────────────────
  const canVerify = Boolean(
    entry &&
    (entry.executionState === 'completed' || entry.executionState === 'failed' || entry.executionState === 'blocked') &&
    !entry.verificationState
  )
  const canRemediate = Boolean(
    entry &&
    (entry.executionState === 'failed' || entry.executionState === 'blocked') &&
    !remediatedRunIds.has(entry.runId)
  )
  const hasActions = canVerify || canRemediate

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!entry || !canVerify || verifyPhase === 'running') return
    setVerifyPhase('running')
    setVerifyNote('')
    try {
      const result = await verifyCheckerRun(entry.runId)
      setVerifyNote(result.note)
      setVerifyPhase('done')
      await onHistoryRefresh?.()
    } catch (error) {
      setVerifyNote(error instanceof Error ? error.message : 'Verification failed.')
      setVerifyPhase('error')
    }
  }

  const handleRemediate = async () => {
    if (!entry || !canRemediate || remediatePhase === 'running') return
    setRemediatePhase('running')
    setRemediateNote('')
    try {
      const request = await createBuilderRemediationRequest(entry, '')
      setRemediateNote(request.note)
      setRemediatePhase('done')
      onRequestCreated?.(request as BuilderExecutionRequest)
    } catch (error) {
      setRemediateNote(error instanceof Error ? error.message : 'Remediation request failed.')
      setRemediatePhase('error')
    }
  }

  // ── Tone helpers ───────────────────────────────────────────────────────────
  const exec    = entry ? execTone(entry.executionState) : null
  const checker = entry ? checkerTone(entry.verificationState) : null
  const builder = entry ? verifyTone(entry.verificationStatus) : null

  const hasFiles        = (entry?.filesChanged?.length  ?? 0) > 0
  const hasCommands     = (entry?.commandsRun?.length   ?? 0) > 0
  const hasLikelyFiles  = (entry?.likelyFiles?.length   ?? 0) > 0
  const hasSummary      = Boolean(entry?.summary)
  const hasBuilderVerify = Boolean(entry?.builderVerificationSummary) ||
    (entry?.verificationStatus && entry.verificationStatus !== 'not-run')
  const hasCheckerVerify = Boolean(entry?.verificationState || entry?.verificationSummary)
  const isRemediation    = Boolean(entry?.sourceRunId)

  const anyActionRunning = verifyPhase === 'running' || remediatePhase === 'running'

  return (
    <AnimatePresence>
      {entry && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width:      'min(520px, 100vw)',
              background: 'rgba(4,10,18,0.97)',
              borderLeft: '1px solid rgba(0,212,255,0.12)',
              boxShadow:  '-12px 0 48px rgba(0,0,0,0.5)',
            }}
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div
              className="flex-shrink-0 px-5 py-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[8px] font-mono tracking-[0.18em]" style={{ color: 'rgba(0,255,136,0.65)' }}>
                      BUILDER RUN
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.30)' }}>
                      {entry.runId}
                    </span>
                  </div>
                  <p className="text-[14px] font-medium leading-snug" style={{ color: 'rgba(244,248,252,0.96)' }}>
                    {entry.taskSummary || entry.summary || 'No task summary.'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {exec && (
                      <StatusPill label={entry.executionState} color={exec.color} bg={exec.bg} border={exec.border} />
                    )}
                    <StatusPill
                      label={entry.target.targetLabel}
                      color="rgba(192,232,240,0.65)"
                      bg="rgba(192,232,240,0.04)"
                      border="rgba(192,232,240,0.14)"
                    />
                    {entry.remediationKind && (
                      <StatusPill
                        label={entry.remediationKind}
                        color="#9ad1ff"
                        bg="rgba(154,209,255,0.08)"
                        border="rgba(154,209,255,0.20)"
                      />
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    cursor: 'pointer',
                    color: 'rgba(192,232,240,0.55)',
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">

              {/* Timestamps + IDs */}
              <Section>
                <SectionHeading icon={TerminalSquare} label="RUN METADATA" accent="rgba(0,212,255,0.65)" />
                <div className="flex flex-col gap-1.5">
                  <MetaRow label="Run ID"     value={entry.runId} />
                  <MetaRow label="Request ID" value={entry.requestId} />
                  {entry.sourceRunId && (
                    <MetaRow label="Source Run"  value={entry.sourceRunId} />
                  )}
                  <MetaRow label="Target"     value={`${entry.target.targetLabel} (${entry.target.targetType})`} />
                  <MetaRow label="Created"    value={fmt(entry.createdAt)} />
                  <MetaRow label="Settled"    value={fmt(entry.settledAt)} />
                  <MetaRow label="Started"    value={fmt(entry.startedAt)} />
                  {entry.finishedAt && (
                    <MetaRow label="Finished"  value={fmt(entry.finishedAt)} />
                  )}
                  {entry.checkedAt && (
                    <MetaRow label="Checked"   value={fmt(entry.checkedAt)} />
                  )}
                  <MetaRow label="Source"     value={entry.sourceLabel} />
                </div>
              </Section>

              {/* Remediation context */}
              {isRemediation && (
                <div
                  className="rounded-xl px-3.5 py-2.5"
                  style={{
                    background: 'rgba(0,212,255,0.04)',
                    border:     '1px solid rgba(0,212,255,0.12)',
                  }}
                >
                  <p className="text-[10px] font-mono leading-snug" style={{ color: 'rgba(0,212,255,0.65)' }}>
                    Remediation of run {entry.sourceRunId}
                    {entry.remediationKind ? ` · ${entry.remediationKind}` : ''}
                  </p>
                </div>
              )}

              {/* Execution summary */}
              {hasSummary && (
                <Section>
                  <SectionHeading icon={Wrench} label="EXECUTION SUMMARY" accent="rgba(0,255,136,0.65)" />
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.82)' }}>
                    {entry.summary}
                  </p>
                </Section>
              )}

              {/* Files changed */}
              {hasFiles && (
                <Section>
                  <SectionHeading icon={FileCode2} label={`FILES CHANGED · ${entry.filesChanged.length}`} accent="rgba(0,212,255,0.65)" />
                  <MonoList items={entry.filesChanged} />
                </Section>
              )}

              {/* Commands run */}
              {hasCommands && (
                <Section>
                  <SectionHeading icon={TerminalSquare} label={`COMMANDS RUN · ${entry.commandsRun.length}`} accent="rgba(255,200,74,0.65)" />
                  <MonoList items={entry.commandsRun} />
                </Section>
              )}

              {/* Likely files (planning artifact) */}
              {hasLikelyFiles && !hasFiles && (
                <Section>
                  <SectionHeading icon={FileCode2} label={`LIKELY FILES · ${entry.likelyFiles.length}`} accent="rgba(192,232,240,0.45)" />
                  <MonoList items={entry.likelyFiles} />
                </Section>
              )}

              {/* Builder verification */}
              {hasBuilderVerify && builder && (
                <Section>
                  <SectionHeading icon={ShieldCheck} label="BUILDER VERIFICATION" accent="rgba(255,200,74,0.65)" />
                  <div className="flex items-center gap-2 mb-2">
                    <StatusPill
                      label={entry.verificationStatus ?? 'not-run'}
                      color={builder.color}
                      bg={builder.bg}
                      border={builder.border}
                    />
                  </div>
                  {entry.builderVerificationSummary && (
                    <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.72)' }}>
                      {entry.builderVerificationSummary}
                    </p>
                  )}
                </Section>
              )}

              {/* Checker verification */}
              {hasCheckerVerify && checker && (
                <Section>
                  <SectionHeading icon={ShieldCheck} label="CHECKER VERIFICATION" accent="rgba(0,255,136,0.65)" />
                  <div className="flex items-center gap-2 mb-2">
                    {entry.verificationState && (
                      <StatusPill
                        label={entry.verificationState}
                        color={checker.color}
                        bg={checker.bg}
                        border={checker.border}
                      />
                    )}
                    {entry.checkedAt && (
                      <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.35)' }}>
                        {fmt(entry.checkedAt)}
                      </span>
                    )}
                  </div>
                  {entry.verificationSummary && (
                    <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.72)' }}>
                      {entry.verificationSummary}
                    </p>
                  )}
                </Section>
              )}

              {/* Bridge note */}
              {entry.note && (
                <div
                  className="rounded-xl px-3.5 py-2.5"
                  style={{
                    background: 'rgba(255,200,74,0.03)',
                    border:     '1px solid rgba(255,200,74,0.10)',
                  }}
                >
                  <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'rgba(255,200,74,0.55)' }}>
                    {entry.note}
                  </p>
                </div>
              )}

              {/* ── Suggested next step ─────────────────────────────────────── */}
              {(() => {
                const suggestion = entry ? deriveRunSuggestion(entry) : null
                // Gate on eligibility — suggestion never shown if the action isn't available
                if (suggestion === 'verify' && !canVerify)     return null
                if (suggestion === 'remediate' && !canRemediate) return null
                if (!suggestion) return null

                const isVerify = suggestion === 'verify'
                const label    = isVerify ? 'VERIFY' : 'REMEDIATE'
                const color    = isVerify ? '#00ff88' : '#ffc84a'
                const bg       = isVerify ? 'rgba(0,255,136,0.07)' : 'rgba(255,200,74,0.07)'
                const border   = isVerify ? 'rgba(0,255,136,0.16)' : 'rgba(255,200,74,0.16)'
                const handler  = isVerify ? handleVerify : handleRemediate
                const done     = isVerify ? verifyPhase === 'done' : remediatePhase === 'done'

                return (
                  <div className="flex items-center gap-2.5 px-1">
                    <span className="text-[9px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.38)' }}>
                      SUGGESTED
                    </span>
                    <button
                      type="button"
                      onClick={() => void handler()}
                      disabled={anyActionRunning || done}
                      className="rounded-full px-2.5 py-1 text-[9px] font-mono tracking-[0.16em]"
                      style={{
                        color:      anyActionRunning || done ? 'rgba(192,232,240,0.34)' : color,
                        background: anyActionRunning || done ? 'rgba(255,255,255,0.03)' : bg,
                        border:     `1px solid ${anyActionRunning || done ? 'rgba(255,255,255,0.07)' : border}`,
                        cursor:     anyActionRunning || done ? 'not-allowed' : 'pointer',
                      }}
                    >
                      → {label}
                    </button>
                  </div>
                )
              })()}

              {/* ── Contextual actions ──────────────────────────────────────── */}
              {hasActions && (
                <div
                  className="rounded-xl px-4 py-3.5 flex flex-col gap-3"
                  style={{
                    background: 'rgba(255,255,255,0.018)',
                    border:     '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <SectionHeading icon={Zap} label="ACTIONS" accent="rgba(0,212,255,0.65)" />

                  <div className="flex flex-wrap gap-2">
                    {canVerify && (
                      <ActionBtn
                        label={verifyPhase === 'running' ? 'VERIFYING…' : verifyPhase === 'done' ? 'VERIFIED ✓' : 'VERIFY'}
                        onClick={() => void handleVerify()}
                        disabled={anyActionRunning || verifyPhase === 'done'}
                        tone="success"
                      />
                    )}
                    {canRemediate && (
                      <ActionBtn
                        label={remediatePhase === 'running' ? 'CREATING…' : remediatePhase === 'done' ? 'REQUESTED ✓' : 'REMEDIATE'}
                        onClick={() => void handleRemediate()}
                        disabled={anyActionRunning || remediatePhase === 'done'}
                        tone="warn"
                      />
                    )}
                  </div>

                  {/* Verify feedback */}
                  {verifyNote && (
                    <p
                      className="text-[10px] font-mono leading-snug"
                      style={{ color: verifyPhase === 'error' ? 'rgba(255,107,53,0.80)' : 'rgba(0,255,136,0.75)' }}
                    >
                      {verifyNote}
                    </p>
                  )}

                  {/* Remediate feedback */}
                  {remediateNote && (
                    <p
                      className="text-[10px] font-mono leading-snug"
                      style={{ color: remediatePhase === 'error' ? 'rgba(255,107,53,0.80)' : 'rgba(255,200,74,0.80)' }}
                    >
                      {remediateNote}
                    </p>
                  )}
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
