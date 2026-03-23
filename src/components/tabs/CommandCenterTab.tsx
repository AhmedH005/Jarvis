import { useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  BookmarkPlus,
  CheckCircle2,
  Compass,
  FileSearch,
  HelpCircle,
  Layers,
  LayoutGrid,
  Save,
  Search,
  Send,
  ShieldCheck,
  Target,
  Terminal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import type { AgentPersonaId } from '@/adapters/agent-control'
import type { TabId } from '@/adapters/backend-files'
import {
  useMissionIntakeStore,
  detectMultiMissions,
  parseSingleMission,
  type MissionActionMode,
  type MissionConfidence,
  type MissionRoute,
} from '@/store/mission-intake'
import {
  useMultiMissionStore,
  buildStagedId,
  type StagedMission,
} from '@/store/multi-mission'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import { useMissionTemplatesStore } from '@/store/mission-templates'
import { MissionTemplatesPanel } from './MissionTemplatesPanel'

// ── Agent accent colours ───────────────────────────────────────────────────────

const AGENT_STYLE: Record<AgentPersonaId, { accent: string; glow: string; dimGlow: string }> = {
  alex:       { accent: '#ffb86b', glow: 'rgba(255,184,107,0.32)', dimGlow: 'rgba(255,184,107,0.10)' },
  researcher: { accent: '#9ad1ff', glow: 'rgba(154,209,255,0.32)', dimGlow: 'rgba(154,209,255,0.10)' },
  kai:        { accent: '#00ff88', glow: 'rgba(0,255,136,0.32)',   dimGlow: 'rgba(0,255,136,0.10)'   },
  maya:       { accent: '#00d4ff', glow: 'rgba(0,212,255,0.32)',   dimGlow: 'rgba(0,212,255,0.10)'   },
  noah:       { accent: '#ffd166', glow: 'rgba(255,209,102,0.32)', dimGlow: 'rgba(255,209,102,0.10)' },
}

const AGENT_ICON: Record<AgentPersonaId, typeof Compass> = {
  alex:       Compass,
  researcher: Search,
  kai:        Wrench,
  maya:       ShieldCheck,
  noah:       Activity,
}

// ── Action mode labels ─────────────────────────────────────────────────────────

const ACTION_MODE_LABEL: Record<MissionActionMode, string> = {
  'plan-only':          'Plan only',
  'execution-request':  'Execution request',
  'verification':       'Verification',
  'remediation':        'Remediation request',
  'ops-check':          'Ops health check',
  'research':           'Gather context',
}

const ACTION_MODE_ICON: Record<MissionActionMode, typeof Target> = {
  'plan-only':          Compass,
  'execution-request':  Terminal,
  'verification':       ShieldCheck,
  'remediation':        FileSearch,
  'ops-check':          Activity,
  'research':           Search,
}

// ── Confidence chip ────────────────────────────────────────────────────────────

const CONFIDENCE_COLOR: Record<MissionConfidence, string> = {
  high:   '#00ff88',
  medium: '#ffc84a',
  low:    '#ff6b35',
}

const CONFIDENCE_LABEL: Record<MissionConfidence, string> = {
  high:   'HIGH CONFIDENCE',
  medium: 'MEDIUM CONFIDENCE',
  low:    'LOW CONFIDENCE — review before handoff',
}

// ── Example missions ───────────────────────────────────────────────────────────

const EXAMPLE_MISSIONS = [
  'Fix the broken calendar event form',
  'Create an execution request to add dark mode support',
  'Verify the last finalized Builder run',
  'Plan the scheduler refactor',
  'Check system gateway health',
  'Review product framing on the agents tab',
  'Remediate the failed run from last session',
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfidenceChip({ confidence }: { confidence: MissionConfidence }) {
  const color = CONFIDENCE_COLOR[confidence]
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-mono tracking-[0.18em]"
      style={{
        color,
        background: `${color}14`,
        border: `1px solid ${color}28`,
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 5, height: 5, background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {CONFIDENCE_LABEL[confidence]}
    </span>
  )
}

function ActionModeChip({ mode }: { mode: MissionActionMode }) {
  const Icon = ACTION_MODE_ICON[mode]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono tracking-[0.12em]"
      style={{
        color: 'rgba(192,232,240,0.72)',
        background: 'rgba(0,212,255,0.06)',
        border: '1px solid rgba(0,212,255,0.14)',
      }}
    >
      <Icon className="h-3 w-3" style={{ color: '#00d4ff' }} />
      {ACTION_MODE_LABEL[mode]}
    </span>
  )
}

function RouteCard({ route }: { route: MissionRoute }) {
  const { confirmHandoff, phase } = useMissionIntakeStore()
  const style = AGENT_STYLE[route.agentId]
  const AgentIcon = AGENT_ICON[route.agentId]
  const isHandedOff = phase === 'handed-off'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="rounded-xl p-5"
      style={{
        background: `linear-gradient(160deg, ${style.dimGlow}, rgba(7,12,20,0.9))`,
        border: `1px solid ${style.accent}28`,
        boxShadow: `0 0 32px ${style.dimGlow}`,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
            style={{
              background: `${style.accent}18`,
              border: `1px solid ${style.accent}30`,
              boxShadow: `0 0 16px ${style.glow}`,
            }}
          >
            <AgentIcon className="h-5 w-5" style={{ color: style.accent }} />
          </div>
          <div>
            <p className="text-[13px] font-mono tracking-[0.12em]" style={{ color: style.accent }}>
              {route.agentName}
            </p>
            <p className="text-[10px]" style={{ color: 'rgba(192,232,240,0.48)' }}>
              {route.agentId === 'alex' ? 'Planner' :
               route.agentId === 'kai'  ? 'Builder' :
               route.agentId === 'maya' ? 'Checker' :
               route.agentId === 'noah' ? 'Ops'     : 'Product'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <ConfidenceChip confidence={route.confidence} />
          {route.ambiguous && (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-mono"
              style={{ color: '#ffc84a' }}
            >
              <HelpCircle className="h-3 w-3" />
              AMBIGUOUS INTENT
            </span>
          )}
        </div>
      </div>

      {/* Mode + target row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ActionModeChip mode={route.actionMode} />
        {route.targetHint && (
          <span
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono tracking-[0.12em]"
            style={{
              color: 'rgba(192,232,240,0.65)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(192,232,240,0.10)',
            }}
          >
            <Target className="h-3 w-3" style={{ color: 'rgba(192,232,240,0.45)' }} />
            {route.targetHint}
          </span>
        )}
      </div>

      {/* Rationale */}
      <p
        className="mt-4 text-[12px] leading-relaxed"
        style={{ color: 'rgba(192,232,240,0.72)' }}
      >
        {route.rationale}
      </p>

      {/* Fallback note */}
      {route.fallbackNote && (
        <div
          className="mt-3 rounded-lg px-3 py-2.5"
          style={{
            background: 'rgba(255,200,74,0.06)',
            border: '1px solid rgba(255,200,74,0.16)',
          }}
        >
          <p className="text-[11px] leading-snug" style={{ color: '#ffc84a' }}>
            {route.fallbackNote}
          </p>
        </div>
      )}

      {/* Truthfulness note */}
      <div
        className="mt-3 rounded-lg px-3 py-2"
        style={{
          background: 'rgba(0,212,255,0.03)',
          border: '1px solid rgba(0,212,255,0.08)',
        }}
      >
        <p className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.48)' }}>
          This is a routing suggestion only. No execution has started. Navigate to the Agents tab to proceed through the real pipeline.
        </p>
      </div>

      {/* Handoff action */}
      <div className="mt-4 flex items-center gap-3">
        {!isHandedOff ? (
          <motion.button
            onClick={confirmHandoff}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5"
            style={{
              background: `${style.accent}18`,
              border: `1px solid ${style.accent}35`,
              color: style.accent,
              cursor: 'pointer',
            }}
            whileHover={{ background: `${style.accent}28`, borderColor: `${style.accent}55` }}
            whileTap={{ scale: 0.97 }}
          >
            <ArrowRight className="h-4 w-4" />
            <span className="text-[11px] font-mono tracking-[0.14em]">
              CONFIRM HANDOFF TO {route.agentName.toUpperCase()}
            </span>
          </motion.button>
        ) : (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2.5"
            style={{
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.18)',
              color: '#00ff88',
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-mono tracking-[0.14em]">HANDED OFF</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Save-as-template bar ───────────────────────────────────────────────────────

function SaveTemplateBar({
  input,
  route,
}: {
  input: string
  route: MissionRoute
}) {
  const saveTemplate = useMissionTemplatesStore((s) => s.saveTemplate)
  const [expanded, setExpanded] = useState(false)
  const [name, setName]         = useState('')
  const [saved, setSaved]       = useState(false)

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName || !input.trim()) return
    saveTemplate(trimmedName, {
      missionText:          input.trim(),
      recommendedAgentId:   route.agentId,
      recommendedAgentName: route.agentName,
      actionMode:           route.actionMode,
      actionLabel:          route.actionLabel,
      targetHint:           route.targetHint,
      targetId:             route.targetId,
      rationale:            route.rationale,
      source:               'user-template',
    })
    setName('')
    setExpanded(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setExpanded(false); setName('') }
  }

  if (saved) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{
          background: 'rgba(0,255,136,0.05)',
          border:     '1px solid rgba(0,255,136,0.18)',
        }}
      >
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#00ff88' }} />
        <span className="text-[10px] font-mono" style={{ color: '#00ff88' }}>
          Template saved to library.
        </span>
      </motion.div>
    )
  }

  return (
    <div>
      {!expanded ? (
        <motion.button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2"
          style={{
            color:      'rgba(192,232,240,0.52)',
            background: 'rgba(255,255,255,0.03)',
            border:     '1px solid rgba(255,255,255,0.08)',
            cursor:     'pointer',
          }}
          whileHover={{ color: 'rgba(192,232,240,0.82)', borderColor: 'rgba(255,255,255,0.14)' }}
          whileTap={{ scale: 0.97 }}
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          <span className="text-[10px] font-mono tracking-[0.14em]">SAVE AS TEMPLATE</span>
        </motion.button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Template name…"
            className="flex-1 rounded-lg bg-transparent px-3 py-2 text-[11px] font-mono outline-none"
            style={{
              color:        'rgba(192,232,240,0.88)',
              border:       '1px solid rgba(0,212,255,0.22)',
              background:   'rgba(0,212,255,0.04)',
              caretColor:   '#00d4ff',
              minWidth:     0,
            }}
          />
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-mono tracking-[0.12em]"
            style={{
              color:      name.trim() ? '#00d4ff'                    : 'rgba(0,212,255,0.28)',
              background: name.trim() ? 'rgba(0,212,255,0.12)'       : 'rgba(0,212,255,0.03)',
              border:     `1px solid ${name.trim() ? 'rgba(0,212,255,0.28)' : 'rgba(0,212,255,0.08)'}`,
              cursor:     name.trim() ? 'pointer' : 'not-allowed',
            }}
            whileHover={name.trim() ? { background: 'rgba(0,212,255,0.20)' } : {}}
            whileTap={name.trim() ? { scale: 0.97 } : {}}
          >
            <Save className="h-3 w-3" />
            SAVE
          </motion.button>
          <motion.button
            type="button"
            onClick={() => { setExpanded(false); setName('') }}
            className="rounded-lg px-2 py-2"
            style={{
              color:      'rgba(192,232,240,0.40)',
              background: 'rgba(255,255,255,0.03)',
              border:     '1px solid rgba(255,255,255,0.07)',
              cursor:     'pointer',
            }}
            whileHover={{ color: 'rgba(192,232,240,0.7)' }}
            whileTap={{ scale: 0.97 }}
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </motion.div>
      )}
    </div>
  )
}

// ── Multi-mission preview ──────────────────────────────────────────────────────
// Shows detected missions before committing. User can remove any item.

function MultiMissionPreview({
  missions,
  onRemove,
  onCreate,
  onBackToSingle,
}: {
  missions:      StagedMission[]
  onRemove:      (id: string) => void
  onCreate:      () => void
  onBackToSingle: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#00d4ff' }} />
          <span className="text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(192,232,240,0.88)' }}>
            MULTI-MISSION DETECTED
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-mono"
            style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.10)', border: '1px solid rgba(0,212,255,0.22)' }}
          >
            {missions.length}
          </span>
        </div>
        <motion.button
          type="button"
          onClick={onBackToSingle}
          className="text-[9px] font-mono"
          style={{ color: 'rgba(192,232,240,0.38)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          whileHover={{ color: 'rgba(192,232,240,0.65)' }}
        >
          parse as single ↩
        </motion.button>
      </div>

      {/* Mission cards */}
      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {missions.map((m) => {
            const style   = AGENT_STYLE[m.route.agentId]
            const AgIcon  = AGENT_ICON[m.route.agentId]
            const MdIcon  = ACTION_MODE_ICON[m.route.actionMode]
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8, transition: { duration: 0.14 } }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {/* Agent icon */}
                <div
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                  style={{ background: `${style.accent}18`, border: `1px solid ${style.accent}30` }}
                >
                  <AgIcon className="h-3 w-3" style={{ color: style.accent }} />
                </div>

                {/* Mission text */}
                <p
                  className="flex-1 min-w-0 text-[11px] font-mono leading-snug truncate"
                  style={{ color: 'rgba(192,232,240,0.82)' }}
                >
                  {m.missionText}
                </p>

                {/* Mode chip */}
                <span
                  className="flex-shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-mono"
                  style={{ color: style.accent, background: `${style.accent}12`, border: `1px solid ${style.accent}24` }}
                >
                  <MdIcon className="h-2.5 w-2.5" />
                  {ACTION_MODE_LABEL[m.route.actionMode]}
                </span>

                {/* Remove */}
                <motion.button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  className="flex-shrink-0 rounded p-1"
                  style={{ color: 'rgba(192,232,240,0.28)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  whileHover={{ color: '#ff6b35' }}
                  whileTap={{ scale: 0.92 }}
                >
                  <X className="h-3 w-3" />
                </motion.button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Empty guard */}
      {missions.length === 0 && (
        <p className="text-center text-[10px] font-mono py-4" style={{ color: 'rgba(192,232,240,0.30)' }}>
          All missions removed — add text or parse as single.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <motion.button
          type="button"
          onClick={onCreate}
          disabled={missions.length === 0}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[10px] font-mono tracking-[0.16em]"
          style={{
            color:      missions.length > 0 ? '#00d4ff'                  : 'rgba(0,212,255,0.28)',
            background: missions.length > 0 ? 'rgba(0,212,255,0.12)'     : 'rgba(0,212,255,0.03)',
            border:     `1px solid ${missions.length > 0 ? 'rgba(0,212,255,0.30)' : 'rgba(0,212,255,0.08)'}`,
            cursor:     missions.length > 0 ? 'pointer' : 'not-allowed',
          }}
          whileHover={missions.length > 0 ? { background: 'rgba(0,212,255,0.20)' } : {}}
          whileTap={missions.length > 0 ? { scale: 0.98 } : {}}
        >
          <Layers className="h-4 w-4" />
          CREATE {missions.length} MISSION{missions.length !== 1 ? 'S' : ''}
        </motion.button>
      </div>

      <div
        className="rounded-lg px-3 py-2"
        style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.08)' }}
      >
        <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'rgba(0,212,255,0.45)' }}>
          Missions are staged — not executed. Hand each one off individually from the queue below.
          No pipeline actions start until you confirm each handoff.
        </p>
      </div>
    </motion.div>
  )
}

// ── Staged missions panel ──────────────────────────────────────────────────────
// Shows queued missions with individual and batch HAND OFF buttons.

function StagedMissionsPanel() {
  const staged        = useMultiMissionStore((s) => s.staged)
  const markHandedOff = useMultiMissionStore((s) => s.markHandedOff)
  const remove        = useMultiMissionStore((s) => s.remove)
  const clear         = useMultiMissionStore((s) => s.clear)
  const setHandoff    = useMissionHandoffStore((s) => s.setHandoff)

  const [batchFeedback, setBatchFeedback] = useState<string | null>(null)

  const pending   = staged.filter((m) => m.status === 'pending')
  const handedOff = staged.filter((m) => m.status === 'handed-off')

  if (staged.length === 0) return null

  function buildHandoffPayload(m: StagedMission) {
    return {
      missionText:  m.missionText,
      agentId:      m.route.agentId,
      agentName:    m.route.agentName,
      actionMode:   m.route.actionMode,
      actionLabel:  m.route.actionLabel,
      targetHint:   m.route.targetHint,
      targetId:     m.route.targetId,
      rationale:    m.route.rationale,
      ambiguous:    m.route.ambiguous,
      source:       'command-center' as const,
      createdAt:    new Date().toISOString(),
    }
  }

  function handleHandoff(m: StagedMission) {
    setHandoff(buildHandoffPayload(m))
    markHandedOff(m.id)
  }

  function handleHandoffAll() {
    const toSend = staged.filter((m) => m.status === 'pending')
    if (toSend.length === 0) return
    // Iterate in order — each setHandoff() replaces the pending slot in the handoff store.
    // User adopts them one at a time from the Agents tab; the last one is always visible.
    toSend.forEach((m) => {
      setHandoff(buildHandoffPayload(m))
      markHandedOff(m.id)
    })
    const n = toSend.length
    setBatchFeedback(`${n} mission${n !== 1 ? 's' : ''} handed off`)
    setTimeout(() => setBatchFeedback(null), 2200)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(4,10,18,0.72)', border: '1px solid rgba(0,212,255,0.10)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />
          <span className="text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(192,232,240,0.82)' }}>
            STAGED MISSIONS
          </span>
          {pending.length > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[8px] font-mono"
              style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.22)' }}
            >
              {pending.length} pending
            </span>
          )}
          {handedOff.length > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[8px] font-mono"
              style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.18)' }}
            >
              {handedOff.length} handed off
            </span>
          )}
        </div>
        <motion.button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[8px] font-mono"
          style={{ color: 'rgba(192,232,240,0.30)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          whileHover={{ color: '#ff6b35' }}
          whileTap={{ scale: 0.95 }}
        >
          <Trash2 className="h-2.5 w-2.5" />
          CLEAR ALL
        </motion.button>
      </div>

      {/* Mission rows */}
      <div className="flex flex-col divide-y" style={{ '--tw-divide-opacity': '1' } as React.CSSProperties}>
        {staged.map((m) => {
          const style   = AGENT_STYLE[m.route.agentId]
          const AgIcon  = AGENT_ICON[m.route.agentId]
          const isPending = m.status === 'pending'

          return (
            <div
              key={m.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                opacity: isPending ? 1 : 0.55,
              }}
            >
              {/* Agent icon */}
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                style={{ background: `${style.accent}14`, border: `1px solid ${style.accent}28` }}
              >
                <AgIcon className="h-3 w-3" style={{ color: style.accent }} />
              </div>

              {/* Text */}
              <p
                className="flex-1 min-w-0 text-[11px] font-mono leading-snug"
                style={{ color: isPending ? 'rgba(192,232,240,0.82)' : 'rgba(192,232,240,0.40)' }}
              >
                <span className="block truncate">{m.missionText}</span>
                <span className="text-[8px]" style={{ color: `${style.accent}88` }}>
                  → {m.route.agentName}  ·  {ACTION_MODE_LABEL[m.route.actionMode]}
                </span>
              </p>

              {/* Actions */}
              {isPending ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <motion.button
                    type="button"
                    onClick={() => handleHandoff(m)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] font-mono tracking-[0.12em]"
                    style={{
                      color:      style.accent,
                      background: `${style.accent}12`,
                      border:     `1px solid ${style.accent}28`,
                      cursor:     'pointer',
                    }}
                    whileHover={{ background: `${style.accent}22`, borderColor: `${style.accent}44` }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <ArrowRight className="h-2.5 w-2.5" />
                    HAND OFF
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => remove(m.id)}
                    className="rounded p-1"
                    style={{ color: 'rgba(192,232,240,0.25)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    whileHover={{ color: '#ff6b35' }}
                    whileTap={{ scale: 0.92 }}
                  >
                    <X className="h-3 w-3" />
                  </motion.button>
                </div>
              ) : (
                <div className="flex-shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" style={{ color: '#00ff88' }} />
                  <span className="text-[8px] font-mono" style={{ color: '#00ff88' }}>HANDED OFF</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Batch footer */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <AnimatePresence mode="wait">
          {batchFeedback ? (
            <motion.span
              key="feedback"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="text-[9px] font-mono"
              style={{ color: '#00ff88' }}
            >
              ✓ {batchFeedback}
            </motion.span>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="text-[8px] font-mono"
              style={{ color: 'rgba(192,232,240,0.24)' }}
            >
              Each handoff routes to the Agents tab independently.
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={handleHandoffAll}
          disabled={pending.length === 0}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[9px] font-mono tracking-[0.12em]"
          style={{
            color:      pending.length > 0 ? '#00d4ff'                  : 'rgba(0,212,255,0.25)',
            background: pending.length > 0 ? 'rgba(0,212,255,0.10)'     : 'rgba(0,212,255,0.03)',
            border:     `1px solid ${pending.length > 0 ? 'rgba(0,212,255,0.26)' : 'rgba(0,212,255,0.07)'}`,
            cursor:     pending.length > 0 ? 'pointer' : 'not-allowed',
          }}
          whileHover={pending.length > 0 ? { background: 'rgba(0,212,255,0.18)', borderColor: 'rgba(0,212,255,0.38)' } : {}}
          whileTap={pending.length > 0 ? { scale: 0.97 } : {}}
        >
          <Layers className="h-3 w-3" />
          HAND OFF {pending.length > 0 ? `${pending.length} ` : ''}PENDING
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

// ── Start Here panel ──────────────────────────────────────────────────────────
// Compact operator guide — three primary workflows. Not onboarding; not a tutorial.

interface Workflow {
  title:       string
  body:        string
  route:       string
  color:       string
  tab?:        TabId
}

const WORKFLOWS: Workflow[] = [
  {
    title: 'SINGLE MISSION',
    body:  'One task, one agent. Describe your goal, confirm the route, hand off.',
    route: 'Command → route → Agents',
    color: '#00d4ff',
  },
  {
    title: 'MULTI-MISSION',
    body:  'Batch 2–3 tasks. Stage all missions, hand off together, process from the inbox.',
    route: 'Command → stage → Agents inbox',
    color: '#9ad1ff',
  },
  {
    title: 'REVIEW / DEBUG',
    body:  'Work already started. Inspect queue, activity feed, and run detail.',
    route: 'System → queue · history · run detail',
    color: '#00ff88',
    tab:   'system',
  },
]

function StartHerePanel({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.015)',
        border:     '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <LayoutGrid className="h-3 w-3 flex-shrink-0" style={{ color: 'rgba(0,212,255,0.55)' }} />
        <span className="text-[9px] font-mono tracking-[0.20em]" style={{ color: 'rgba(0,212,255,0.55)' }}>
          START HERE
        </span>
        <span className="ml-auto text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.22)' }}>
          choose your workflow
        </span>
      </div>

      {/* Workflow cards */}
      <div className="grid grid-cols-1 gap-px sm:grid-cols-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {WORKFLOWS.map((wf) => (
          <div
            key={wf.title}
            className="flex flex-col gap-2 px-4 py-4"
            style={{ background: 'rgba(4,10,18,0.80)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{ width: 6, height: 6, background: wf.color, boxShadow: `0 0 8px ${wf.color}` }}
              />
              <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: wf.color }}>
                {wf.title}
              </span>
            </div>

            <p className="text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.70)' }}>
              {wf.body}
            </p>

            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <span className="text-[9px] font-mono leading-snug" style={{ color: 'rgba(192,232,240,0.28)' }}>
                {wf.route}
              </span>
              {wf.tab && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(wf.tab!)}
                  className="flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[9px] font-mono tracking-[0.12em]"
                  style={{
                    color:      wf.color,
                    background: `${wf.color}0f`,
                    border:     `1px solid ${wf.color}28`,
                    cursor:     'pointer',
                  }}
                >
                  GO
                  <ArrowRight className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CommandCenterTab({ onNavigate }: { onNavigate?: (tab: TabId) => void } = {}) {
  const { input, phase, route, handoffNote, setInput, parseRoute, clearMission } = useMissionIntakeStore()
  const stageMulti = useMultiMissionStore((s) => s.stage)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Local preview state — holds detected missions before the user commits
  const [multiPreview, setMultiPreview] = useState<StagedMission[] | null>(null)

  function handleParse() {
    if (!input.trim()) return
    const detected = detectMultiMissions(input)
    if (detected && detected.length >= 2) {
      const missions: StagedMission[] = detected.map((text) => ({
        id:          buildStagedId(),
        missionText: text,
        route:       parseSingleMission(text),
        status:      'pending',
      }))
      setMultiPreview(missions)
    } else {
      setMultiPreview(null)
      parseRoute()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleParse()
    }
  }

  function handleExampleClick(example: string) {
    setInput(example)
    setMultiPreview(null)
    textareaRef.current?.focus()
  }

  function handleCreateMissions() {
    if (!multiPreview || multiPreview.length === 0) return
    stageMulti(multiPreview)
    setMultiPreview(null)
    clearMission()
  }

  const canParse = input.trim().length > 0 && phase !== 'handed-off'
  const hasRoute = (phase === 'parsed' || phase === 'handed-off') && !multiPreview

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">

      {/* ── Start Here ───────────────────────────────────────────────────────── */}
      <StartHerePanel onNavigate={onNavigate} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
            style={{
              background: 'rgba(0,212,255,0.10)',
              border: '1px solid rgba(0,212,255,0.22)',
            }}
          >
            <Terminal className="h-4 w-4" style={{ color: '#00d4ff' }} />
          </div>
          <h2
            className="text-[15px] font-mono tracking-[0.16em]"
            style={{ color: 'rgba(192,232,240,0.92)' }}
          >
            MISSION INTAKE
          </h2>
          <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.30)' }}>
            describe your goal · JARVIS routes it
          </span>
        </div>
      </div>

      {/* ── Input surface ─────────────────────────────────────────────────────── */}
      <div>
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(4,12,22,0.82)',
            border: `1px solid ${input.trim() ? 'rgba(0,212,255,0.26)' : 'rgba(0,212,255,0.12)'}`,
            boxShadow: input.trim() ? '0 0 28px rgba(0,212,255,0.07)' : 'none',
            transition: 'border-color 0.18s, box-shadow 0.18s',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'Describe your mission — e.g. "Fix the calendar event form", "Verify the last run", "Plan the scheduler refactor"'}
            rows={4}
            className="w-full resize-none bg-transparent px-5 py-4 text-[13px] leading-relaxed outline-none"
            style={{
              color: 'rgba(192,232,240,0.88)',
              caretColor: '#00d4ff',
              fontFamily: 'ui-monospace, monospace',
            }}
          />

          {/* Footer bar */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5"
            style={{ borderTop: '1px solid rgba(0,212,255,0.08)' }}
          >
            <p className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.36)' }}>
              {input.trim() ? `${input.trim().length} chars` : 'Type a mission above'}
              {' · '}⌘↵ to parse
            </p>

            <div className="flex items-center gap-2">
              {input.trim() && (
                <motion.button
                  onClick={clearMission}
                  className="flex items-center gap-1 rounded px-2 py-1"
                  style={{
                    color: 'rgba(192,232,240,0.4)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                  }}
                  whileHover={{ color: 'rgba(192,232,240,0.7)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  <X className="h-3 w-3" />
                  <span className="text-[10px] font-mono">CLEAR</span>
                </motion.button>
              )}
              <motion.button
                onClick={handleParse}
                disabled={!canParse}
                className="flex items-center gap-2 rounded-lg px-4 py-1.5"
                style={{
                  background: canParse ? 'rgba(0,212,255,0.14)' : 'rgba(0,212,255,0.04)',
                  border: `1px solid ${canParse ? 'rgba(0,212,255,0.32)' : 'rgba(0,212,255,0.08)'}`,
                  color: canParse ? '#00d4ff' : 'rgba(0,212,255,0.28)',
                  cursor: canParse ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
                whileHover={canParse ? { background: 'rgba(0,212,255,0.22)' } : {}}
                whileTap={canParse ? { scale: 0.97 } : {}}
              >
                <Send className="h-3.5 w-3.5" />
                <span className="text-[11px] font-mono tracking-[0.14em]">
                  {phase === 'parsed' || phase === 'handed-off' ? 'RE-PARSE' : 'PARSE MISSION'}
                </span>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Handoff confirmation note */}
        <AnimatePresence>
          {handoffNote && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 overflow-hidden"
            >
              <div
                className="rounded-lg px-3 py-2.5"
                style={{
                  background: 'rgba(0,255,136,0.05)',
                  border: '1px solid rgba(0,255,136,0.18)',
                }}
              >
                <p className="text-[11px] leading-snug font-mono" style={{ color: '#00ff88' }}>
                  {handoffNote}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Multi-mission preview ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {multiPreview && (
          <motion.div key="multi-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="mb-3 text-[9px] font-mono tracking-[0.2em]" style={{ color: 'rgba(0,212,255,0.50)' }}>
              MULTI-MISSION PREVIEW
            </p>
            <MultiMissionPreview
              missions={multiPreview}
              onRemove={(id) => setMultiPreview((prev) => prev ? prev.filter((m) => m.id !== id) : null)}
              onCreate={handleCreateMissions}
              onBackToSingle={() => { setMultiPreview(null); parseRoute() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Route preview (single mission) ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {hasRoute && route && (
          <motion.div
            key="route-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p
              className="mb-3 text-[9px] font-mono tracking-[0.2em]"
              style={{ color: 'rgba(0,212,255,0.50)' }}
            >
              SUGGESTED ROUTE
            </p>
            <RouteCard route={route} />

            {/* Save-as-template bar (below route card) */}
            <div className="mt-3">
              <SaveTemplateBar input={input} route={route} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Staged missions queue ─────────────────────────────────────────────── */}
      <StagedMissionsPanel />

      {/* ── Mission template library (always visible) ─────────────────────────── */}
      <MissionTemplatesPanel />

      {/* ── Examples (shown when idle) ─────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p
              className="mb-3 text-[9px] font-mono tracking-[0.2em]"
              style={{ color: 'rgba(0,212,255,0.50)' }}
            >
              EXAMPLE MISSIONS
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_MISSIONS.map((example) => (
                <motion.button
                  key={example}
                  onClick={() => handleExampleClick(example)}
                  className="rounded-lg px-3 py-2 text-left text-[11px] leading-snug"
                  style={{
                    background: 'rgba(0,212,255,0.04)',
                    border: '1px solid rgba(0,212,255,0.10)',
                    color: 'rgba(192,232,240,0.58)',
                    cursor: 'pointer',
                  }}
                  whileHover={{
                    background: 'rgba(0,212,255,0.09)',
                    borderColor: 'rgba(0,212,255,0.22)',
                    color: 'rgba(192,232,240,0.82)',
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  {example}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Architecture note ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: 'rgba(255,255,255,0.018)',
          border:     '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex flex-col gap-1">
          {[
            'Routing is local and deterministic — no AI inference, no backend call.',
            'Handoff confirmation is a navigation intent only, not an execution trigger.',
            'Suggested routes map to real existing pipeline actions: Builder, Checker, or planning.',
          ].map((line) => (
            <p key={line} className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(192,232,240,0.32)' }}>
              — {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
