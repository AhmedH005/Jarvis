import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Inbox,
  Play,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import type { AgentPersonaId } from '@/adapters/agent-control'
import type { BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import { useBuilderExecutionRequestStore } from '@/store/builder-execution-request'
import { useBuilderExecutionStore } from '@/store/builder-execution'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import {
  deriveWorkQueue,
  filterWorkQueue,
  QUEUE_KIND_META,
  type WorkQueueItem,
  type WorkQueueKind,
  type WorkQueueTargetFilter,
} from '@/lib/work-queue'
import { ActionChip, CountBadge, PanelHeader } from './shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(d)
}

const AGENT_LABEL: Record<AgentPersonaId, string> = {
  alex:       'Alex',
  kai:        'Kai',
  maya:       'Maya',
  noah:       'Noah',
  researcher: 'Researcher',
}

const AGENT_ICON: Record<AgentPersonaId, typeof Wrench> = {
  alex:       Activity,
  kai:        Wrench,
  maya:       ShieldCheck,
  noah:       Activity,
  researcher: Search,
}

// Contextual action label + icon per queue kind — replaces the generic "OPEN" label
const QUEUE_ACTION: Record<WorkQueueKind, { label: string; Icon: typeof ExternalLink; feedbackNote: string }> = {
  'in-progress':           { label: 'VIEW RUN',  Icon: ExternalLink, feedbackNote: 'Opening Kai…'  },
  'awaiting-approval':     { label: 'APPROVE',   Icon: CheckCircle2, feedbackNote: 'Opening Kai…'  },
  'approved-ready':        { label: 'START RUN', Icon: Play,         feedbackNote: 'Opening Kai…'  },
  'remediation-pending':   { label: 'REMEDIATE', Icon: Wrench,       feedbackNote: 'Opening Kai…'  },
  'needs-remediation':     { label: 'REMEDIATE', Icon: Wrench,       feedbackNote: 'Opening Kai…'  },
  'awaiting-verification': { label: 'VERIFY',    Icon: ShieldCheck,  feedbackNote: 'Opening Maya…' },
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[9px] font-mono tracking-[0.14em]"
      style={{
        color:      active ? 'rgba(192,232,240,0.92)' : 'rgba(192,232,240,0.42)',
        background: active ? 'rgba(0,212,255,0.12)'   : 'rgba(255,255,255,0.03)',
        border:     `1px solid ${active ? 'rgba(0,212,255,0.28)' : 'rgba(255,255,255,0.07)'}`,
        cursor: 'pointer',
      }}
      whileHover={{ color: 'rgba(192,232,240,0.78)' }}
      whileTap={{ scale: 0.96 }}
    >
      {label}
    </motion.button>
  )
}

// ── Queue item row ────────────────────────────────────────────────────────────

function QueueRow({
  item,
  onOpen,
}: {
  item:   WorkQueueItem
  onOpen: (item: WorkQueueItem) => void
}) {
  const meta     = QUEUE_KIND_META[item.kind]
  const AgIcon   = AGENT_ICON[item.recommendedAgent]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="rounded-xl px-4 py-3.5"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border:     '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start gap-3">

        {/* Kind dot */}
        <div
          className="mt-0.5 flex-shrink-0 rounded-full"
          style={{
            width: 8, height: 8,
            marginTop: 6,
            background: meta.color,
            boxShadow: `0 0 8px ${meta.color}`,
          }}
        />

        {/* Content */}
        <div className="min-w-0 flex-1">

          {/* Top row: kind badge + target + agent hint */}
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className="rounded px-1.5 py-0.5 text-[8px] font-mono tracking-[0.16em]"
              style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
            >
              {meta.label}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[8px] font-mono"
              style={{
                color:      'rgba(192,232,240,0.55)',
                background: 'rgba(255,255,255,0.03)',
                border:     '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {item.targetLabel}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[8px] font-mono"
              style={{ color: 'rgba(192,232,240,0.40)' }}
            >
              <AgIcon className="h-2.5 w-2.5" />
              {AGENT_LABEL[item.recommendedAgent]}
            </span>
          </div>

          {/* Summary */}
          <p
            className="text-[12px] leading-snug"
            style={{ color: 'rgba(244,248,252,0.88)' }}
          >
            {item.summary}
          </p>

          {/* Bottom row: timestamp + source */}
          <div className="mt-2 flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1 text-[9px] font-mono"
              style={{ color: 'rgba(192,232,240,0.38)' }}
            >
              <Clock className="h-2.5 w-2.5" />
              {item.primaryTsLabel} {fmtTs(item.primaryTs)}
            </span>
            {item.source === 'local-demo-fallback' && (
              <span
                className="text-[8px] font-mono"
                style={{ color: 'rgba(255,200,74,0.55)' }}
              >
                demo fallback
              </span>
            )}
          </div>
        </div>

        {/* Contextual action chip */}
        {(() => {
          const action = QUEUE_ACTION[item.kind]
          const meta   = QUEUE_KIND_META[item.kind]
          return (
            <ActionChip
              label={action.label}
              Icon={action.Icon}
              accent={meta.color}
              capability="navigational"
              feedbackNote={action.feedbackNote}
              onClick={() => onOpen(item)}
            />
          )
        })()}
      </div>
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyQueue({ note }: { note?: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl px-6 py-8"
      style={{
        background: 'rgba(255,255,255,0.012)',
        border:     '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <CheckCircle2 className="h-6 w-6" style={{ color: 'rgba(0,255,136,0.30)' }} />
      <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.44)' }}>
        Queue clear.
      </p>
      {note && (
        <p className="max-w-xs text-center text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.26)' }}>
          {note}
        </p>
      )}
    </div>
  )
}

// ── Kind filter row ───────────────────────────────────────────────────────────

const KIND_FILTER_OPTIONS: Array<{ value: WorkQueueKind | 'all'; label: string }> = [
  { value: 'all',                  label: 'ALL KINDS'    },
  { value: 'in-progress',          label: 'IN PROGRESS'  },
  { value: 'awaiting-approval',    label: 'APPROVAL'     },
  { value: 'approved-ready',       label: 'READY'        },
  { value: 'remediation-pending',  label: 'REMEDIATION'  },
  { value: 'needs-remediation',    label: 'FAILED'       },
  { value: 'awaiting-verification',label: 'VERIFY'       },
]

const TARGET_FILTER_OPTIONS: Array<{ value: WorkQueueTargetFilter; label: string }> = [
  { value: 'all',     label: 'ALL TARGETS' },
  { value: 'app',     label: 'APP'         },
  { value: 'package', label: 'PACKAGE'     },
  { value: 'docs',    label: 'DOCS'        },
  { value: 'repo',    label: 'REPO'        },
]

// ── Main export ───────────────────────────────────────────────────────────────

export function WorkQueuePanel({
  history,
}: {
  history: BuilderExecutionHistorySnapshot
}) {
  const request         = useBuilderExecutionRequestStore(s => s.request)
  const run             = useBuilderExecutionStore(s => s.run)
  const navigateToAgent = useMissionHandoffStore(s => s.navigateToAgent)

  const [targetFilter, setTargetFilter] = useState<WorkQueueTargetFilter>('all')
  const [kindFilter,   setKindFilter]   = useState<WorkQueueKind | 'all'>('all')

  // Derive the full queue from live pipeline state
  const allItems = useMemo(
    () => deriveWorkQueue(request, run, history),
    [request, run, history],
  )

  const visibleItems = useMemo(
    () => filterWorkQueue(allItems, targetFilter, kindFilter),
    [allItems, targetFilter, kindFilter],
  )

  const urgentCount = allItems.filter(
    i => i.kind === 'needs-remediation' || i.kind === 'awaiting-approval'
  ).length

  function handleOpen(item: WorkQueueItem) {
    navigateToAgent(item.recommendedAgent)
  }

  const historyUnavailable = history.source === 'local-demo-fallback' && history.status === 'blocked'

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(4,10,18,0.65)',
        border:     '1px solid rgba(0,212,255,0.09)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PanelHeader
        Icon={Inbox}
        title="OPERATOR INBOX"
        sublabel="Live pipeline state only"
        badge={<CountBadge count={allItems.length} urgent={urgentCount > 0} />}
        right={
          <div className="hidden lg:flex items-center gap-3">
            {(['in-progress','awaiting-approval','approved-ready','needs-remediation','awaiting-verification'] as WorkQueueKind[]).map(kind => {
              const c = allItems.filter(i => i.kind === kind).length
              if (c === 0) return null
              const meta = QUEUE_KIND_META[kind]
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setKindFilter(kindFilter === kind ? 'all' : kind)}
                  className="flex items-center gap-1.5"
                  style={{ cursor: 'pointer' }}
                >
                  <Circle className="h-2 w-2 fill-current" style={{ color: meta.color }} />
                  <span className="text-[9px] font-mono tabular-nums" style={{ color: meta.color }}>
                    {c}
                  </span>
                </button>
              )
            })}
          </div>
        }
      />

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 px-5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {TARGET_FILTER_OPTIONS.map(opt => (
          <FilterPill
            key={opt.value}
            label={opt.label}
            active={targetFilter === opt.value}
            onClick={() => setTargetFilter(opt.value)}
          />
        ))}
        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 10 }}>·</span>
        {KIND_FILTER_OPTIONS.map(opt => (
          <FilterPill
            key={opt.value}
            label={opt.label}
            active={kindFilter === opt.value}
            onClick={() => setKindFilter(opt.value)}
          />
        ))}
      </div>

      {/* ── Items ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 py-4">

        {historyUnavailable && (
          <div
            className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{
              background: 'rgba(255,200,74,0.04)',
              border:     '1px solid rgba(255,200,74,0.12)',
            }}
          >
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.65)' }}>
              Builder execution history unavailable in fallback mode — queue reflects live store state only.
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {visibleItems.map(item => (
            <QueueRow key={item.id} item={item} onOpen={handleOpen} />
          ))}
        </AnimatePresence>

        {visibleItems.length === 0 && (
          <EmptyQueue
            note={
              allItems.length > 0
                ? `${allItems.length} item${allItems.length > 1 ? 's' : ''} exist with other filters.`
                : historyUnavailable
                  ? 'Execution history could not be loaded. Items will appear when the Builder bridge is available.'
                  : undefined
            }
          />
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.28)' }}>
          All items derived from real request, run, and history state.
        </p>
      </div>
    </div>
  )
}
