import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  Loader2,
  ScrollText,
  Square,
  Terminal,
  Users,
} from 'lucide-react'
import {
  loadBuilderExecutionHistory,
  type BuilderExecutionHistoryEntry,
  type BuilderExecutionHistorySnapshot,
} from '@/adapters/builder-execution'

// ── Types ──────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'running' | 'error' | 'complete'
type BackingLabel = 'REAL' | 'OVERLAY' | 'PARTIAL'

interface AgentDef {
  id: string
  name: string
  role: string
  accent: string
  backing: BackingLabel
  backingColor: string
}

// ── Team definition ────────────────────────────────────────────────────────────
// Steve   → real Builder execution spine (kai / builder-bridge)
// Natasha → real Checker verification pass (maya / checker bridge)
// Tony    → planning overlay — no dedicated execution bridge
// Bruce   → research overlay — no dedicated execution bridge
// Nick    → ops reader — reads system state, no execution bridge

const AGENT_DEFS: AgentDef[] = [
  { id: 'steve',   name: 'Steve',   role: 'Builder · execution spine',    accent: '#00d4ff', backing: 'REAL',    backingColor: '#00ff88' },
  { id: 'natasha', name: 'Natasha', role: 'Checker · verification pass',   accent: '#00ff88', backing: 'REAL',    backingColor: '#00ff88' },
  { id: 'tony',    name: 'Tony',    role: 'Planner · arch overlay',        accent: '#ffc84a', backing: 'OVERLAY', backingColor: 'rgba(192,232,240,0.35)' },
  { id: 'bruce',   name: 'Bruce',   role: 'Researcher · context overlay',  accent: '#b975ff', backing: 'OVERLAY', backingColor: 'rgba(192,232,240,0.35)' },
  { id: 'nick',    name: 'Nick',    role: 'Ops · system reader',           accent: '#ff6b35', backing: 'PARTIAL', backingColor: '#ffc84a' },
]

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle:     'rgba(74,122,138,0.7)',
  running:  '#00d4ff',
  error:    '#ff6b35',
  complete: '#00ff88',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle:     'IDLE',
  running:  'RUNNING',
  error:    'ERROR',
  complete: 'COMPLETE',
}

// ── Derive per-agent status from real execution history ────────────────────────
// Only Steve and Natasha have real execution paths. The rest are always idle.

function deriveTeamStatus(
  history: BuilderExecutionHistorySnapshot | null
): Record<string, AgentStatus> {
  const entries = history?.entries ?? []
  const activeRun = entries.find(e => e.executionState === 'started')
  const lastRun = entries[0]

  const steve: AgentStatus = activeRun
    ? 'running'
    : !lastRun ? 'idle'
    : lastRun.executionState === 'completed' ? 'complete'
    : lastRun.executionState === 'failed' ? 'error'
    : 'idle'

  // Natasha runs after Steve — waiting while Steve is active
  const natasha: AgentStatus = activeRun
    ? 'idle'
    : !lastRun ? 'idle'
    : lastRun.verificationStatus === 'passed' ? 'complete'
    : lastRun.verificationStatus === 'failed' ? 'error'
    : 'idle'

  return { steve, natasha, tony: 'idle', bruce: 'idle', nick: 'idle' }
}

// ── CodingTeamTab ─────────────────────────────────────────────────────────────

export function CodingTeamTab() {
  const [history, setHistory] = useState<BuilderExecutionHistorySnapshot | null>(null)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  useEffect(() => {
    void loadBuilderExecutionHistory().then(setHistory)
    const id = setInterval(() => void loadBuilderExecutionHistory().then(setHistory), 15_000)
    return () => clearInterval(id)
  }, [])

  const entries = history?.entries ?? []
  const activeRuns = entries.filter(e => e.executionState === 'started')
  const recentRuns = entries.slice(0, 12)
  const teamStatus = deriveTeamStatus(history)
  const activeTask = activeRuns[0]

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Left: Team roster */}
      <div
        className="flex flex-col flex-shrink-0 overflow-y-auto"
        style={{ width: 260, borderRight: '1px solid rgba(0,212,255,0.08)' }}
      >
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
            <span className="text-[10px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.7)' }}>TEAM</span>
          </div>
          <div className="space-y-2">
            {AGENT_DEFS.map(def => (
              <AgentCard
                key={def.id}
                def={def}
                status={teamStatus[def.id] ?? 'idle'}
                currentTask={
                  def.id === 'steve' && activeTask
                    ? (activeTask.taskSummary || activeTask.summary || undefined)
                    : undefined
                }
              />
            ))}
          </div>

          {/* Backing legend */}
          <div className="mt-4 space-y-1" style={{ borderTop: '1px solid rgba(0,212,255,0.06)', paddingTop: '0.75rem' }}>
            <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>REAL — dedicated execution bridge</p>
            <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>PARTIAL — grounded, no exec bridge</p>
            <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>OVERLAY — planning / context only</p>
          </div>
        </div>
      </div>

      {/* Right: Execution log */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Active runs banner */}
        {activeRuns.length > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
            style={{ background: 'rgba(0,212,255,0.05)', borderBottom: '1px solid rgba(0,212,255,0.10)' }}
          >
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: '#00d4ff' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-[10px] font-mono" style={{ color: '#00d4ff' }}>
              {activeRuns.length} run{activeRuns.length > 1 ? 's' : ''} active — Steve executing
            </span>
          </div>
        )}

        <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.07)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
              <span className="text-[10px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.7)' }}>EXECUTION LOG</span>
            </div>
            <span className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>
              {entries.length} runs total
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {!history && (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'rgba(0,212,255,0.4)' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>Loading runs…</span>
            </div>
          )}

          {history && recentRuns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileCode2 className="w-8 h-8" style={{ color: 'rgba(0,212,255,0.2)' }} />
              <p className="text-[11px] font-mono text-center" style={{ color: 'rgba(74,122,138,0.5)' }}>
                No runs yet.<br />Ask JARVIS to build something in Chat.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {recentRuns.map(run => (
              <RunRow
                key={run.runId}
                run={run}
                expanded={expandedRun === run.runId}
                onToggle={() => setExpandedRun(expandedRun === run.runId ? null : run.runId)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({
  def,
  status,
  currentTask,
}: {
  def: AgentDef
  status: AgentStatus
  currentTask?: string
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: `${def.accent}08`,
        border: `1px solid ${def.accent}18`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: `${def.accent}14`, border: `1px solid ${def.accent}22` }}
        >
          <Code2 className="w-3 h-3" style={{ color: def.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.85)' }}>{def.name}</p>
          <p className="text-[8px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.38)' }}>{def.role}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <div className="flex items-center gap-1">
            {status === 'running' ? (
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: STATUS_COLOR.running }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
            )}
            <span className="text-[7px] font-mono" style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
          </div>
          <span className="text-[7px] font-mono" style={{ color: def.backingColor }}>{def.backing}</span>
        </div>
      </div>
      {currentTask && (
        <p className="text-[9px] font-mono mt-1.5 truncate" style={{ color: 'rgba(192,232,240,0.45)' }}>
          › {currentTask}
        </p>
      )}
    </div>
  )
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: BuilderExecutionHistoryEntry
  expanded: boolean
  onToggle: () => void
}) {
  const state = run.executionState
  const stateColor =
    state === 'completed' ? '#00ff88' :
    state === 'failed'    ? '#ff6b35' :
    state === 'started'   ? '#00d4ff' :
    'rgba(74,122,138,0.6)'

  const date = run.finishedAt ?? run.startedAt
  const formatted = date
    ? new Date(date).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.022)',
        border: `1px solid ${
          state === 'started'   ? 'rgba(0,212,255,0.16)' :
          state === 'completed' ? 'rgba(0,255,136,0.10)' :
          state === 'failed'    ? 'rgba(255,107,53,0.10)' :
          'rgba(255,255,255,0.05)'
        }`,
      }}
    >
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left">
        <div className="flex-shrink-0">
          {state === 'started' && (
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity }}>
              <Activity className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
            </motion.div>
          )}
          {state === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />}
          {state === 'failed'    && <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ff6b35' }} />}
          {state === 'blocked'   && <Square className="w-3.5 h-3.5" style={{ color: 'rgba(74,122,138,0.6)' }} />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono leading-snug truncate" style={{ color: 'rgba(192,232,240,0.82)' }}>
            {run.taskSummary || run.summary || run.runId}
          </p>
          <p className="text-[8px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>
            {run.runId} · {formatted}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded"
            style={{ color: stateColor, background: `${stateColor}14`, border: `1px solid ${stateColor}30` }}
          >
            {state.toUpperCase()}
          </span>
          {expanded
            ? <ChevronDown className="w-3 h-3" style={{ color: 'rgba(192,232,240,0.3)' }} />
            : <ChevronRight className="w-3 h-3" style={{ color: 'rgba(192,232,240,0.3)' }} />
          }
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1 space-y-2.5" style={{ borderTop: '1px solid rgba(0,212,255,0.06)' }}>
              {run.summary && (
                <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(192,232,240,0.6)' }}>{run.summary}</p>
              )}

              {(run.filesChanged ?? []).length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileCode2 className="w-2.5 h-2.5" style={{ color: 'rgba(0,212,255,0.5)' }} />
                    <span className="text-[8px] font-mono" style={{ color: 'rgba(0,212,255,0.5)' }}>FILES CHANGED</span>
                  </div>
                  <div className="space-y-0.5">
                    {(run.filesChanged ?? []).map((f, i) => (
                      <p key={i} className="text-[9px] font-mono truncate pl-4" style={{ color: 'rgba(192,232,240,0.5)' }}>{f}</p>
                    ))}
                  </div>
                </div>
              )}

              {(run.commandsRun ?? []).length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <ScrollText className="w-2.5 h-2.5" style={{ color: 'rgba(0,255,136,0.5)' }} />
                    <span className="text-[8px] font-mono" style={{ color: 'rgba(0,255,136,0.5)' }}>COMMANDS</span>
                  </div>
                  {(run.commandsRun ?? []).map((c, i) => (
                    <code key={i} className="block text-[9px] font-mono pl-4" style={{ color: '#00ff88' }}>{c}</code>
                  ))}
                </div>
              )}

              {run.verificationStatus && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>VERIFICATION</span>
                  <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color:
                        run.verificationStatus === 'passed' ? '#00ff88' :
                        run.verificationStatus === 'failed' ? '#ff6b35' :
                        'rgba(74,122,138,0.6)',
                      background:
                        run.verificationStatus === 'passed' ? 'rgba(0,255,136,0.08)' :
                        run.verificationStatus === 'failed' ? 'rgba(255,107,53,0.08)' :
                        'rgba(74,122,138,0.08)',
                    }}
                  >
                    {run.verificationStatus.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
