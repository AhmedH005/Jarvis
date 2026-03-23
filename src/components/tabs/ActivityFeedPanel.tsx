import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, ArrowRight, Clock, Play, RadioTower, ShieldCheck, Wrench } from 'lucide-react'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import { useBuilderExecutionRequestStore } from '@/store/builder-execution-request'
import { useBuilderExecutionStore } from '@/store/builder-execution'
import type { AgentPersonaId } from '@/adapters/agent-control'
import type { BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import {
  deriveActivityFeed,
  filterActivityFeed,
  EVENT_KIND_META,
  type ActivityEvent,
  type ActivityEventFilter,
  type ActivityEventKind,
} from '@/lib/activity-feed'
import { ActionChip, CountBadge, PanelHeader } from './shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)     return 'just now'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit',
    hour:  '2-digit', minute: '2-digit',
    hour12: false,
  }).format(d)
}

const AGENT_COLORS: Record<string, string> = {
  alex: '#00d4ff',
  kai:  '#ffc84a',
  maya: '#00ff88',
  noah: '#9ad1ff',
  eli:  '#ffb86b',
}

// ── Event action derivation ───────────────────────────────────────────────────
// Maps each event kind to a contextual next action. Returns null when no
// further action makes sense (e.g. verification-added = already done).

type EventAction = {
  label:   string
  Icon:    typeof Activity
  accent:  string
  agentId: AgentPersonaId
}

function deriveEventAction(
  kind:      ActivityEventKind,
  agentId:   AgentPersonaId | undefined,
  agentName: string | undefined,
): EventAction | null {
  switch (kind) {
    case 'mission-handoff':
      if (!agentId || !agentName) return null
      return {
        label:   `OPEN ${agentName.toUpperCase()}`,
        Icon:    ArrowRight,
        accent:  AGENT_COLORS[agentId] ?? '#00d4ff',
        agentId,
      }
    case 'request-created':
      return { label: 'OPEN KAI',   Icon: Wrench,     accent: '#00ff88', agentId: 'kai'  }
    case 'request-approved':
      return { label: 'START RUN',  Icon: Play,        accent: '#00ff88', agentId: 'kai'  }
    case 'run-started':
      return { label: 'VIEW RUN',   Icon: Activity,    accent: '#00d4ff', agentId: 'kai'  }
    case 'run-finalized':
      return { label: 'VERIFY',     Icon: ShieldCheck, accent: '#00d4ff', agentId: 'maya' }
    case 'remediation-created':
      return { label: 'OPEN KAI',   Icon: Wrench,      accent: '#ffb86b', agentId: 'kai'  }
    // request-denied and verification-added have no further action
    case 'request-denied':
    case 'verification-added':
    default:
      return null
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  count,
  onClick,
}: {
  label:   string
  active:  boolean
  count?:  number
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-mono tracking-[0.14em]"
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
      {count !== undefined && count > 0 && (
        <span
          className="rounded-full px-1 tabular-nums"
          style={{
            color:      active ? 'rgba(192,232,240,0.88)' : 'rgba(192,232,240,0.46)',
            background: active ? 'rgba(0,212,255,0.18)'   : 'rgba(255,255,255,0.05)',
          }}
        >
          {count}
        </span>
      )}
    </motion.button>
  )
}

function AgentChip({ agentId, agentName }: { agentId: string; agentName: string }) {
  const color = AGENT_COLORS[agentId] ?? 'rgba(192,232,240,0.6)'
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[8px] font-mono"
      style={{
        color,
        background: `${color}16`,
        border:     `1px solid ${color}30`,
      }}
    >
      {agentName}
    </span>
  )
}

function TargetChip({ target }: { target: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[8px] font-mono"
      style={{
        color:      'rgba(192,232,240,0.52)',
        background: 'rgba(255,255,255,0.03)',
        border:     '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {target}
    </span>
  )
}

function EventRow({ event }: { event: ActivityEvent }) {
  const meta           = EVENT_KIND_META[event.kind]
  const navigateToAgent = useMissionHandoffStore((s) => s.navigateToAgent)

  const action = deriveEventAction(event.kind, event.agentId, event.agentName)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border:     '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Kind dot */}
      <div
        className="mt-1 flex-shrink-0 rounded-full"
        style={{
          width:     7,
          height:    7,
          background: meta.color,
          boxShadow:  `0 0 6px ${meta.color}88`,
          marginTop:  6,
        }}
      />

      <div className="min-w-0 flex-1">
        {/* Chips row */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded px-1.5 py-0.5 text-[8px] font-mono tracking-[0.13em]"
            style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            {meta.label}
          </span>
          {event.agentId && event.agentName && (
            <AgentChip agentId={event.agentId} agentName={event.agentName} />
          )}
          {event.target && <TargetChip target={event.target} />}
        </div>

        {/* Summary */}
        <p
          className="text-[11px] leading-snug"
          style={{ color: 'rgba(244,248,252,0.80)' }}
        >
          {event.summary}
        </p>

        {/* Timestamp + action chip */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-2.5 w-2.5 flex-shrink-0" style={{ color: 'rgba(192,232,240,0.30)' }} />
            <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.35)' }}>
              {relativeTime(event.createdAt)}
            </span>
            {event.source === 'local-demo-fallback' && (
              <span className="text-[8px] font-mono" style={{ color: 'rgba(255,200,74,0.42)' }}>
                demo
              </span>
            )}
          </div>
          {action && (
            <ActionChip
              label={action.label}
              Icon={action.Icon}
              accent={action.accent}
              capability="navigational"
              feedbackNote={`Opening ${action.agentId.charAt(0).toUpperCase() + action.agentId.slice(1)}…`}
              onClick={() => navigateToAgent(action.agentId)}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}

function EmptyFeed({ note }: { note?: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl px-6 py-8"
      style={{
        background: 'rgba(255,255,255,0.012)',
        border:     '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <RadioTower className="h-5 w-5" style={{ color: 'rgba(0,212,255,0.20)' }} />
      <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.36)' }}>
        No activity yet.
      </p>
      <p
        className="max-w-xs text-center text-[9px] font-mono"
        style={{ color: 'rgba(192,232,240,0.22)' }}
      >
        {note ?? 'Events appear as plans, requests, runs, and verifications are created.'}
      </p>
    </div>
  )
}

// ── Filter options ────────────────────────────────────────────────────────────

const FILTER_OPTIONS: Array<{ value: ActivityEventFilter; label: string }> = [
  { value: 'all',         label: 'ALL'         },
  { value: 'builder',     label: 'BUILDER'     },
  { value: 'checker',     label: 'CHECKER'     },
  { value: 'handoff',     label: 'HANDOFF'     },
  { value: 'remediation', label: 'REMEDIATION' },
]

// ── Main export ───────────────────────────────────────────────────────────────

export function ActivityFeedPanel({
  history,
}: {
  history: BuilderExecutionHistorySnapshot
}) {
  const handoff = useMissionHandoffStore((s) => s.activeHandoff)
  const request = useBuilderExecutionRequestStore((s) => s.request)
  const run     = useBuilderExecutionStore((s) => s.run)

  const [filter, setFilter] = useState<ActivityEventFilter>('all')

  const allEvents = useMemo(() => {
    try {
      return deriveActivityFeed(handoff, request, run, history)
    } catch {
      return []
    }
  }, [handoff, request, run, history])

  const visibleEvents = useMemo(
    () => filterActivityFeed(allEvents, filter),
    [allEvents, filter],
  )

  function countFor(f: ActivityEventFilter): number {
    if (f === 'all') return allEvents.length
    return filterActivityFeed(allEvents, f).length
  }

  const historyUnavailable =
    history.source === 'local-demo-fallback' && history.status === 'blocked'

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
        Icon={Activity}
        title="ACTIVITY FEED"
        sublabel="Live state only"
        badge={<CountBadge count={allEvents.length} />}
      />

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 px-5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {FILTER_OPTIONS.map((opt) => (
          <FilterPill
            key={opt.value}
            label={opt.label}
            active={filter === opt.value}
            count={opt.value !== 'all' ? countFor(opt.value) : undefined}
            onClick={() => setFilter(opt.value)}
          />
        ))}
      </div>

      {/* ── Events ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 py-4">
        {historyUnavailable && allEvents.length === 0 && (
          <div
            className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{
              background: 'rgba(255,200,74,0.04)',
              border:     '1px solid rgba(255,200,74,0.12)',
            }}
          >
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.62)' }}>
              Builder execution history unavailable — feed reflects live store state only.
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {visibleEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </AnimatePresence>

        {visibleEvents.length === 0 && (
          <EmptyFeed
            note={
              allEvents.length > 0
                ? `${allEvents.length} event${allEvents.length > 1 ? 's' : ''} exist under other filters.`
                : historyUnavailable
                  ? 'Execution history could not be loaded. Events will appear once the Builder bridge is available.'
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
          Derived from request, run, handoff, and history state.
        </p>
      </div>
    </div>
  )
}
