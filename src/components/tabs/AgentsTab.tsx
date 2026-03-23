import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileCode2,
  HelpCircle,
  Lock,
  Maximize2,
  Minimize2,
  PauseCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  Wrench,
  X,
} from 'lucide-react'
import type { BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import type { DemoSection } from '@/adapters/backend-files'
import {
  AGENT_FOCUS_OPTIONS,
  buildAgentControlSurfaces,
  type AgentBackingState,
  type AgentControlMode,
  type AgentControlSurface,
  type AgentPersonaId,
} from '@/adapters/agent-control'
import type { AgentOperationalData } from '@/adapters/agent-operations'
import type { RunHistorySnapshot } from '@/adapters/run-history'
import { useAgentControlStore } from '@/store/agent-control'
import { useMissionHandoffStore, type MissionHandoff, type ResearchContext } from '@/store/mission-handoff'
import { useBuilderPlanStore } from '@/store/builder-plan'
import { AgentWorkSurface } from './AgentWorkSurface'
import { BuilderExecutionHistoryPanel } from './BuilderExecutionHistoryPanel'
import { BuilderPlanPanel } from './BuilderPlanPanel'
import { TruthBadge } from './TruthBadge'
import { FieldRow, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

// ── Persona styles ────────────────────────────────────────────────────────────

const PERSONA_STYLE: Record<AgentPersonaId, {
  accent: string
  glow: string
  cardBg: string
  iconBg: string
  Icon: typeof Compass
}> = {
  alex:       { accent: '#ffb86b', glow: 'rgba(255,184,107,0.18)', cardBg: 'rgba(255,184,107,0.06)', iconBg: 'rgba(255,184,107,0.12)', Icon: Compass     },
  researcher: { accent: '#9ad1ff', glow: 'rgba(154,209,255,0.18)', cardBg: 'rgba(154,209,255,0.06)', iconBg: 'rgba(154,209,255,0.12)', Icon: Search      },
  kai:        { accent: '#00ff88', glow: 'rgba(0,255,136,0.18)',   cardBg: 'rgba(0,255,136,0.06)',   iconBg: 'rgba(0,255,136,0.12)',   Icon: Wrench      },
  maya:       { accent: '#00d4ff', glow: 'rgba(0,212,255,0.18)',   cardBg: 'rgba(0,212,255,0.06)',   iconBg: 'rgba(0,212,255,0.12)',   Icon: ShieldCheck },
  noah:       { accent: '#ffd166', glow: 'rgba(255,209,102,0.18)', cardBg: 'rgba(255,209,102,0.06)', iconBg: 'rgba(255,209,102,0.12)', Icon: Activity    },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

function parseLineItems(value: string) {
  return value.split('\n').map((l) => l.trim()).filter(Boolean)
}

// ── Research context → enriched plan prompt ───────────────────────────────────
// Composes a structured, editable plan prompt from Researcher brief output.
// No AI, no fabrication — just structured concatenation.

function composeEnrichedPrompt(
  missionText:     string,
  ctx:             ResearchContext,
  targetAgentId:   'alex' | 'kai' | string,
): string {
  const lines: string[] = [missionText.trim(), '']

  lines.push('--- Research context (edit as needed) ---')

  if (ctx.summary) {
    lines.push(`Summary: ${ctx.summary}`)
  }

  if (targetAgentId === 'kai' && ctx.options.length > 0) {
    lines.push('')
    lines.push('Options:')
    ctx.options.forEach((o) => {
      lines.push(`• ${o.label}${o.description ? `: ${o.description}` : ''}`)
    })
  }

  if (ctx.keyFindings.length > 0) {
    lines.push('')
    lines.push(ctx.scaffolded ? 'Questions to investigate:' : 'Key findings:')
    ctx.keyFindings.forEach((f) => lines.push(`• ${f}`))
  }

  if (ctx.tradeoffs.length > 0) {
    lines.push('')
    lines.push('Trade-offs:')
    ctx.tradeoffs.forEach((t) => lines.push(`• ${t}`))
  }

  return lines.join('\n')
}

function toneForMode(mode: AgentControlMode) {
  if (mode === 'paused')      return { label: 'PAUSED',      color: '#ffc84a', bg: 'rgba(255,200,74,0.10)',  border: 'rgba(255,200,74,0.22)',  Icon: PauseCircle  }
  if (mode === 'constrained') return { label: 'CONSTRAINED', color: '#ff9a54', bg: 'rgba(255,154,84,0.10)',  border: 'rgba(255,154,84,0.22)',  Icon: Lock         }
  return                               { label: 'ACTIVE',      color: '#00ff88', bg: 'rgba(0,255,136,0.10)',  border: 'rgba(0,255,136,0.22)',  Icon: CheckCircle2 }
}

function backingTone(b: AgentBackingState) {
  if (b === 'real-backed')           return { color: '#00ff88',               bg: 'rgba(0,255,136,0.08)',    border: 'rgba(0,255,136,0.2)',    label: 'REAL'    }
  if (b === 'partially real-backed') return { color: '#ffc84a',               bg: 'rgba(255,200,74,0.08)',   border: 'rgba(255,200,74,0.2)',   label: 'PARTIAL' }
  return                                    { color: 'rgba(192,232,240,0.65)', bg: 'rgba(192,232,240,0.05)', border: 'rgba(192,232,240,0.14)', label: 'DOC'     }
}

function Chip({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-mono tracking-[0.13em]"
      style={{ color, background: bg, border: `1px solid ${border}` }}>
      {label}
    </span>
  )
}

// ── Collapsible wrapper ────────────────────────────────────────────────────────

function CollapsibleSection({ title, accent, icon: Icon, children, defaultOpen = false }: {
  title: string; accent: string; icon: typeof Workflow; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(4,10,18,0.65)' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3" style={{ cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          <span className="text-[10px] font-mono tracking-[0.15em]" style={{ color: accent }}>{title}</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.16 }}>
          <ChevronDown className="h-3.5 w-3.5" style={{ color: 'rgba(192,232,240,0.35)' }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}>
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Text field (for Advanced > Profile) ───────────────────────────────────────

function Field({ label, value, onChange, accent, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void
  accent: string; placeholder?: string; rows?: number
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-mono tracking-[0.15em]" style={{ color: `${accent}BB` }}>{label}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="mt-1.5 w-full rounded-lg px-3 py-2 text-[11px] leading-relaxed outline-none resize-none"
        style={{ color: 'rgba(192,232,240,0.9)', background: 'rgba(4,10,18,0.8)', border: `1px solid ${accent}20`, fontFamily: 'ui-monospace, monospace' }} />
    </label>
  )
}

// ── Agent selector strip ───────────────────────────────────────────────────────

function AgentStrip({ surfaces, selectedId, onSelect }: {
  surfaces: AgentControlSurface[]; selectedId: AgentPersonaId; onSelect: (id: AgentPersonaId) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {surfaces.map(s => {
        const style = PERSONA_STYLE[s.id]
        const Icon  = style.Icon
        const sel   = s.id === selectedId
        const mode  = toneForMode(s.mode)
        const back  = backingTone(s.backingState)

        return (
          <motion.button key={s.id} type="button" onClick={() => onSelect(s.id)}
            className="relative flex flex-col items-start gap-2 overflow-hidden rounded-xl px-4 py-4 text-left"
            style={{
              background: sel ? style.cardBg : 'rgba(10,18,28,0.6)',
              border: `1px solid ${sel ? `${style.accent}38` : 'rgba(255,255,255,0.07)'}`,
              boxShadow: sel ? `0 0 20px ${style.glow}` : 'none',
              cursor: 'pointer',
              transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
            }}
            whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}>

            {sel && (
              <motion.div layoutId="agent-rail"
                className="absolute bottom-0 inset-x-4 rounded-t-full"
                style={{ height: 2, background: style.accent, boxShadow: `0 0 8px ${style.accent}` }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
            )}

            <div className="flex items-center gap-2.5 w-full">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ background: style.iconBg, border: `1px solid ${style.accent}22` }}>
                <Icon className="h-4 w-4" style={{ color: style.accent }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-tight truncate"
                  style={{ color: sel ? 'rgba(244,248,252,0.98)' : 'rgba(192,232,240,0.82)' }}>
                  {s.name}
                </p>
                <p className="text-[9px] font-mono tracking-[0.12em] truncate"
                  style={{ color: `${style.accent}${sel ? 'CC' : '77'}` }}>
                  {s.roleTitle.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-auto">
              <Chip label={mode.label} color={mode.color} bg={mode.bg} border={mode.border} />
              <Chip label={back.label} color={back.color} bg={back.bg} border={back.border} />
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Compact agent header ──────────────────────────────────────────────────────

function AgentHeader({ surface, onReset }: {
  surface: AgentControlSurface
  onReset: () => void
}) {
  const style   = PERSONA_STYLE[surface.id]
  const Icon    = style.Icon
  const mode    = toneForMode(surface.mode)
  const backing = backingTone(surface.backingState)

  return (
    <div className="rounded-xl px-5 py-4"
      style={{ background: style.cardBg, border: `1px solid ${style.accent}28` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: style.iconBg, border: `1px solid ${style.accent}28` }}>
            <Icon className="h-5 w-5" style={{ color: style.accent }} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h3 className="text-[18px] font-semibold" style={{ color: 'rgba(244,248,252,0.98)' }}>
                {surface.name}
              </h3>
              <TruthBadge label={surface.truthStatus} />
              <Chip label={mode.label} color={mode.color} bg={mode.bg} border={mode.border} />
              <Chip label={backing.label} color={backing.color} bg={backing.bg} border={backing.border} />
            </div>
            <p className="text-[10px] font-mono tracking-[0.13em] mb-1.5"
              style={{ color: `${style.accent}BB` }}>
              {surface.roleTitle.toUpperCase()}
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.76)' }}>
              {surface.purpose}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Chip
            label={surface.focusTarget.targetLabel}
            color={style.accent}
            bg={`${style.accent}14`}
            border={`${style.accent}28`}
          />
          <button type="button" onClick={onReset}
            className="text-[9px] font-mono"
            style={{ color: 'rgba(192,232,240,0.35)', cursor: 'pointer', background: 'none', border: 'none' }}>
            reset
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Advanced section contents ─────────────────────────────────────────────────

function AgentAdvanced({
  surface,
  onSetMode,
  onRoleTitleChange,
  onMissionChange,
  onResponsibilitiesChange,
  onFocusChange,
  onNotesChange,
  onToggleVisibleCapability,
}: {
  surface: AgentControlSurface
  onSetMode: (m: AgentControlMode) => void
  onRoleTitleChange: (v: string) => void
  onMissionChange: (v: string) => void
  onResponsibilitiesChange: (v: string) => void
  onFocusChange: (id: string) => void
  onNotesChange: (v: string) => void
  onToggleVisibleCapability: (c: string) => void
}) {
  const style       = PERSONA_STYLE[surface.id]
  const selFocusId  = surface.focusOptionId ?? 'repo-wide'

  const [roleTitle, setRoleTitle]           = useState(surface.roleTitle)
  const [mission, setMission]               = useState(surface.mission)
  const [responsibilities, setResponsibilities] = useState(surface.responsibilities.join('\n'))
  const [notes, setNotes]                   = useState(surface.notes)

  useEffect(() => {
    setRoleTitle(surface.roleTitle)
    setMission(surface.mission)
    setResponsibilities(surface.responsibilities.join('\n'))
    setNotes(surface.notes)
  }, [surface.id, surface.roleTitle, surface.mission, surface.responsibilities, surface.notes])

  return (
    <div className="flex flex-col gap-4 pt-1">

      {/* Mode */}
      <div>
        <p className="mb-2 text-[9px] font-mono tracking-[0.15em]" style={{ color: `${style.accent}88` }}>STATUS</p>
        <div className="flex flex-wrap gap-2">
          {(['active', 'paused', 'constrained'] as AgentControlMode[]).map(m => {
            const t   = toneForMode(m)
            const sel = surface.mode === m
            return (
              <button key={m} type="button" onClick={() => onSetMode(m)}
                className="rounded-full px-3 py-1.5 text-[10px] font-mono tracking-[0.13em]"
                style={{ color: t.color, background: sel ? t.bg : 'rgba(255,255,255,0.03)', border: `1px solid ${sel ? t.border : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
                {m.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Focus target */}
      <div>
        <p className="mb-2 text-[9px] font-mono tracking-[0.15em]" style={{ color: `${style.accent}88` }}>FOCUS TARGET</p>
        <div className="flex flex-col gap-1.5">
          {AGENT_FOCUS_OPTIONS.map(opt => {
            const sel = opt.id === selFocusId
            return (
              <button key={opt.id} type="button" onClick={() => onFocusChange(opt.id)}
                className="rounded-lg px-3 py-2 text-left"
                style={{ background: sel ? `${style.accent}10` : 'rgba(255,255,255,0.025)', border: `1px solid ${sel ? `${style.accent}28` : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-mono" style={{ color: sel ? style.accent : 'rgba(244,248,252,0.82)' }}>{opt.label}</span>
                  {sel && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: style.accent }} />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Profile */}
      <div className="flex flex-col gap-3">
        <p className="text-[9px] font-mono tracking-[0.15em]" style={{ color: `${style.accent}88` }}>PROFILE</p>
        <Field label="Role Title" value={roleTitle} onChange={v => { setRoleTitle(v); onRoleTitleChange(v) }} accent={style.accent} rows={1} />
        <Field label="Mission" value={mission} onChange={v => { setMission(v); onMissionChange(v) }} accent={style.accent} rows={3} />
        <Field label="Responsibilities" value={responsibilities} onChange={v => { setResponsibilities(v); onResponsibilitiesChange(v) }} accent={style.accent} rows={4} placeholder="One per line" />
        <Field label="Notes" value={notes} onChange={v => { setNotes(v); onNotesChange(v) }} accent={style.accent} rows={2} />
      </div>

      {/* Visible Capabilities */}
      {surface.availableCapabilities.length > 0 && (
        <div>
          <p className="mb-2 text-[9px] font-mono tracking-[0.15em]" style={{ color: `${style.accent}88` }}>VISIBLE CAPABILITIES</p>
          <div className="flex flex-col gap-1.5">
            {surface.availableCapabilities.map(cap => {
              const checked = surface.visibleCapabilities.includes(cap)
              return (
                <button key={cap} type="button" onClick={() => onToggleVisibleCapability(cap)}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: checked ? `${style.accent}10` : 'rgba(255,255,255,0.025)', border: `1px solid ${checked ? `${style.accent}22` : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer' }}>
                  <span className="text-[10px] leading-snug" style={{ color: 'rgba(244,248,252,0.86)' }}>{cap}</span>
                  <span className="text-[8px] font-mono" style={{ color: checked ? style.accent : 'rgba(192,232,240,0.35)' }}>
                    {checked ? 'ON' : 'OFF'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Blocked capabilities */}
      {surface.blockedCapabilities.length > 0 && (
        <div>
          <p className="mb-2 text-[9px] font-mono tracking-[0.15em]" style={{ color: 'rgba(255,107,53,0.6)' }}>BLOCKED</p>
          <ItemList items={surface.blockedCapabilities} color="#ff6b35" />
        </div>
      )}

      {/* Source note */}
      <FieldRow label="Source" value={surface.sourceAgent.title} mono />
      <FieldRow label="Last seen" value={surface.lastActivityAt ? fmt(surface.lastActivityAt) : 'No recorded run'} />
    </div>
  )
}

// ── Full agent detail panel ───────────────────────────────────────────────────

function AgentDetail({
  surface,
  onSetMode,
  onRoleTitleChange,
  onMissionChange,
  onResponsibilitiesChange,
  onFocusChange,
  onNotesChange,
  onToggleVisibleCapability,
  onReset,
  builderExecutionHistory,
  onBuilderExecutionHistoryChange,
}: {
  surface: AgentControlSurface
  onSetMode: (m: AgentControlMode) => void
  onRoleTitleChange: (v: string) => void
  onMissionChange: (v: string) => void
  onResponsibilitiesChange: (v: string) => void
  onFocusChange: (id: string) => void
  onNotesChange: (v: string) => void
  onToggleVisibleCapability: (c: string) => void
  onReset: () => void
  builderExecutionHistory: BuilderExecutionHistorySnapshot
  onBuilderExecutionHistoryChange: (h: BuilderExecutionHistorySnapshot) => void
}) {
  const style = PERSONA_STYLE[surface.id]

  return (
    <div className="flex flex-col gap-3">

      {/* 1. Compact header */}
      <AgentHeader surface={surface} onReset={onReset} />

      {/* 2. Primary: actions — always visible */}
      <div className="rounded-xl px-4 py-4"
        style={{ background: 'rgba(4,10,18,0.65)', border: `1px solid ${style.accent}18` }}>
        <AgentWorkSurface
          surface={surface}
          history={builderExecutionHistory}
          onHistoryChange={onBuilderExecutionHistoryChange}
          accent={style.accent}
          mode="actions"
        />
      </div>

      {/* Kai: Builder plan panel under actions */}
      {surface.id === 'kai' && <BuilderPlanPanel agent={surface.sourceAgent} />}

      {/* 3. Work — collapsed by default */}
      <CollapsibleSection title="WORK" accent={style.accent} icon={Workflow}>
        <AgentWorkSurface
          surface={surface}
          history={builderExecutionHistory}
          onHistoryChange={onBuilderExecutionHistoryChange}
          accent={style.accent}
          mode="work"
        />
      </CollapsibleSection>

      {/* 4. Advanced — collapsed by default */}
      <CollapsibleSection title="ADVANCED" accent={style.accent} icon={Settings2}>
        <AgentAdvanced
          surface={surface}
          onSetMode={onSetMode}
          onRoleTitleChange={onRoleTitleChange}
          onMissionChange={onMissionChange}
          onResponsibilitiesChange={onResponsibilitiesChange}
          onFocusChange={onFocusChange}
          onNotesChange={onNotesChange}
          onToggleVisibleCapability={onToggleVisibleCapability}
        />
      </CollapsibleSection>

    </div>
  )
}

// ── Handoff banner ────────────────────────────────────────────────────────────

function HandoffBanner({
  handoff,
  onAdopt,
  onDismiss,
}: {
  handoff:   MissionHandoff
  onAdopt:   () => void
  onDismiss: () => void
}) {
  const style = PERSONA_STYLE[handoff.agentId]

  return (
    <motion.div
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(150deg, ${style.cardBg}, rgba(4,10,18,0.96))`,
        border: `1px solid ${style.accent}38`,
        boxShadow: `0 0 40px ${style.glow}, 0 2px 12px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ background: `${style.accent}0a`, borderBottom: `1px solid ${style.accent}18` }}>
        <div className="flex items-center gap-2">
          <ArrowRight className="h-3.5 w-3.5" style={{ color: style.accent }} />
          <span className="text-[10px] font-mono tracking-[0.20em]" style={{ color: style.accent }}>
            {handoff.source === 'researcher' ? 'RESEARCHER HANDOFF' : 'COMMAND CENTER HANDOFF'}
          </span>
          <span className="rounded px-2 py-0.5 text-[9px] font-mono tracking-[0.14em]"
            style={{ color: `${style.accent}99`, background: `${style.accent}0e`, border: `1px solid ${style.accent}22` }}>
            {handoff.agentName.toUpperCase()}
          </span>
        </div>
        <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.36)' }}>
          {new Date(handoff.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 px-5 py-5">
        <div>
          <p className="mb-1.5 text-[9px] font-mono tracking-[0.18em]" style={{ color: `${style.accent}80` }}>MISSION</p>
          <p className="text-[14px] leading-snug font-medium" style={{ color: 'rgba(244,248,252,0.96)' }}>
            {handoff.missionText}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-mono tracking-[0.12em]"
            style={{ color: style.accent, background: `${style.accent}12`, border: `1px solid ${style.accent}28` }}>
            {handoff.actionLabel}
          </span>
          {handoff.targetHint && (
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-mono tracking-[0.12em]"
              style={{ color: 'rgba(192,232,240,0.65)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(192,232,240,0.10)' }}>
              <Target className="h-3 w-3" style={{ color: 'rgba(192,232,240,0.4)' }} />
              {handoff.targetHint}
            </span>
          )}
          {handoff.ambiguous && (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono" style={{ color: '#ffc84a' }}>
              <HelpCircle className="h-3 w-3" />
              AMBIGUOUS — REVIEW BEFORE ACTING
            </span>
          )}
        </div>

        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.72)' }}>
          {handoff.rationale}
        </p>

        {/* Research context block — present only for Researcher handoffs */}
        {handoff.researchContext && (
          <div
            className="flex flex-col gap-2.5 rounded-xl px-4 py-3.5"
            style={{
              background: 'rgba(255,200,74,0.04)',
              border:     '1px solid rgba(255,200,74,0.14)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 flex-shrink-0" style={{ color: 'rgba(255,200,74,0.65)' }} />
              <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: 'rgba(255,200,74,0.65)' }}>
                FROM RESEARCHER  ·  RESEARCH-DERIVED CONTEXT
              </span>
            </div>

            {handoff.researchContext.summary && (
              <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.75)' }}>
                {handoff.researchContext.summary}
              </p>
            )}

            {handoff.researchContext.keyFindings.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <p className="text-[8px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.38)' }}>
                  {handoff.researchContext.scaffolded ? 'QUESTIONS TO INVESTIGATE' : 'KEY FINDINGS'}
                </p>
                {handoff.researchContext.keyFindings.slice(0, 3).map((item) => (
                  <div key={item} className="flex items-start gap-1.5">
                    <span className="text-[9px] font-mono flex-shrink-0 mt-px" style={{ color: 'rgba(255,200,74,0.50)' }}>›</span>
                    <span className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.62)' }}>{item}</span>
                  </div>
                ))}
                {handoff.researchContext.keyFindings.length > 3 && (
                  <p className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.28)' }}>
                    +{handoff.researchContext.keyFindings.length - 3} more — visible after adopting
                  </p>
                )}
              </div>
            )}

            {handoff.researchContext.tradeoffs.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <p className="text-[8px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.38)' }}>
                  TRADE-OFFS
                </p>
                {handoff.researchContext.tradeoffs.slice(0, 2).map((item) => (
                  <div key={item} className="flex items-start gap-1.5">
                    <span className="text-[9px] font-mono flex-shrink-0 mt-px" style={{ color: 'rgba(255,200,74,0.50)' }}>›</span>
                    <span className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.62)' }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[8px] font-mono" style={{ color: 'rgba(255,200,74,0.40)' }}>
              All fields are editable after adopting. Not verified external truth.
            </p>
          </div>
        )}

        <div className="rounded-xl px-3.5 py-2.5"
          style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.09)' }}>
          <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(0,212,255,0.52)' }}>
            No execution has started. Adopting prefills this agent's mission context only.
            Your first action here begins the real pipeline.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <motion.button onClick={onAdopt}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ background: `${style.accent}18`, border: `1px solid ${style.accent}38`, color: style.accent, cursor: 'pointer' }}
            whileHover={{ background: `${style.accent}28`, borderColor: `${style.accent}55` }}
            whileTap={{ scale: 0.97 }}>
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-mono tracking-[0.14em]">ADOPT HANDOFF</span>
          </motion.button>
          <motion.button onClick={onDismiss}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(192,232,240,0.48)', cursor: 'pointer' }}
            whileHover={{ color: 'rgba(192,232,240,0.82)', borderColor: 'rgba(255,255,255,0.16)' }}
            whileTap={{ scale: 0.97 }}>
            <X className="h-3.5 w-3.5" />
            <span className="text-[11px] font-mono tracking-[0.14em]">DISMISS</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Next mission hint ─────────────────────────────────────────────────────────
// Shown after adopt when queue still has items. No auto-execution — explicit opt-in only.

function NextMissionHint({
  next,
  onOpen,
}: {
  next:   MissionHandoff
  onOpen: () => void
}) {
  const style = PERSONA_STYLE[next.agentId]
  const label = next.missionText.length > 62
    ? next.missionText.slice(0, 59) + '…'
    : next.missionText

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.16 } }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: 'rgba(0,212,255,0.04)',
        border:     '1px solid rgba(0,212,255,0.12)',
      }}
    >
      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'rgba(0,255,136,0.60)' }} />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.52)' }}>
          READY  ·  NEXT MISSION AVAILABLE
        </p>
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
          {label}
        </p>
      </div>
      <motion.button
        type="button"
        onClick={onOpen}
        className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2"
        style={{
          background: `${style.accent}14`,
          border:     `1px solid ${style.accent}30`,
          color:      style.accent,
          cursor:     'pointer',
        }}
        whileHover={{ background: `${style.accent}26` }}
        whileTap={{ scale: 0.97 }}
      >
        <ArrowRight className="h-3 w-3" />
        <span className="text-[10px] font-mono tracking-[0.12em]">OPEN NEXT</span>
      </motion.button>
    </motion.div>
  )
}

// ── Incoming missions inbox ───────────────────────────────────────────────────

function IncomingMissionsPanel({
  queue,
  activeHandoff,
  onSelect,
}: {
  queue:         MissionHandoff[]
  activeHandoff: MissionHandoff | null
  onSelect:      (h: MissionHandoff) => void
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(4,10,18,0.65)',
        border:     '1px solid rgba(0,212,255,0.12)',
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <ArrowRight className="h-3 w-3" style={{ color: 'rgba(0,212,255,0.55)' }} />
        <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: 'rgba(0,212,255,0.55)' }}>
          INCOMING MISSIONS
        </span>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[8px] font-mono tabular-nums"
          style={{ color: 'rgba(0,212,255,0.65)', background: 'rgba(0,212,255,0.10)', border: '1px solid rgba(0,212,255,0.18)' }}
        >
          {queue.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 px-3 py-3">
        {queue.map((h) => {
          const style   = PERSONA_STYLE[h.agentId]
          const isActive = h === activeHandoff
          return (
            <motion.button
              key={h.createdAt + h.agentId}
              type="button"
              onClick={() => onSelect(h)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left"
              style={{
                background: isActive ? style.cardBg : 'rgba(255,255,255,0.025)',
                border:     `1px solid ${isActive ? `${style.accent}38` : 'rgba(255,255,255,0.06)'}`,
                cursor:     'pointer',
              }}
              whileHover={{ background: isActive ? style.cardBg : 'rgba(255,255,255,0.04)' }}
              whileTap={{ scale: 0.98 }}
            >
              <div
                className="flex-shrink-0 rounded-full"
                style={{
                  width: 6, height: 6,
                  background:  style.accent,
                  boxShadow:   isActive ? `0 0 6px ${style.accent}` : 'none',
                  opacity:     isActive ? 1 : 0.45,
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[11px] leading-snug"
                  style={{ color: isActive ? 'rgba(244,248,252,0.96)' : 'rgba(192,232,240,0.72)' }}
                >
                  {h.missionText}
                </p>
                <p
                  className="text-[8px] font-mono"
                  style={{ color: `${style.accent}${isActive ? 'AA' : '60'}` }}
                >
                  {h.agentName.toUpperCase()}  ·  {h.actionLabel}
                </p>
              </div>
              {isActive && (
                <span
                  className="flex-shrink-0 rounded px-1.5 py-0.5 text-[7px] font-mono tracking-[0.14em]"
                  style={{ color: style.accent, background: `${style.accent}12`, border: `1px solid ${style.accent}28` }}
                >
                  ACTIVE
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AgentsTab({ section, agents, runHistory, builderExecutionHistory }: {
  section: DemoSection
  agents: AgentOperationalData[]
  runHistory: RunHistorySnapshot
  builderExecutionHistory: BuilderExecutionHistorySnapshot
}) {
  const configs               = useAgentControlStore(s => s.configs)
  const updateConfig          = useAgentControlStore(s => s.updateConfig)
  const setResponsibilities   = useAgentControlStore(s => s.setResponsibilities)
  const setMode               = useAgentControlStore(s => s.setMode)
  const setFocusTarget        = useAgentControlStore(s => s.setFocusTarget)
  const toggleVisibleCapability = useAgentControlStore(s => s.toggleVisibleCapability)
  const resetConfig           = useAgentControlStore(s => s.resetConfig)

  const handoffQueue         = useMissionHandoffStore(s => s.handoffQueue)
  const activeHandoff        = useMissionHandoffStore(s => s.activeHandoff)
  const setActiveHandoff     = useMissionHandoffStore(s => s.setActiveHandoff)
  const adoptHandoff         = useMissionHandoffStore(s => s.adopt)
  const dismissHandoff       = useMissionHandoffStore(s => s.dismiss)
  const agentSelectHint      = useMissionHandoffStore(s => s.agentSelectHint)
  const clearAgentSelectHint = useMissionHandoffStore(s => s.clearAgentSelectHint)
  const setBuilderPlanPrompt = useBuilderPlanStore(s => s.setPrompt)

  const [focusMode, setFocusMode] = useState(false)
  const [currentHistory, setCurrentHistory] = useState(builderExecutionHistory)
  const surfaces = useMemo(
    () => buildAgentControlSurfaces({ agents, builderExecutionHistory: currentHistory, configs }),
    [agents, currentHistory, configs]
  )
  const [selectedId, setSelectedId] = useState<AgentPersonaId>('kai')

  useEffect(() => { setCurrentHistory(builderExecutionHistory) }, [builderExecutionHistory])
  useEffect(() => {
    if (!surfaces.some(s => s.id === selectedId) && surfaces[0]) setSelectedId(surfaces[0].id)
  }, [selectedId, surfaces])

  useEffect(() => {
    if (activeHandoff) setSelectedId(activeHandoff.agentId)
  }, [activeHandoff?.agentId])

  useEffect(() => {
    if (agentSelectHint) {
      setSelectedId(agentSelectHint)
      clearAgentSelectHint()
    }
  }, [agentSelectHint, clearAgentSelectHint])

  // Exit focus mode automatically when there is no active handoff to focus on
  useEffect(() => {
    if (!activeHandoff) setFocusMode(false)
  }, [activeHandoff])

  function handleAdoptHandoff() {
    if (!activeHandoff) return

    const planText = activeHandoff.researchContext
      ? composeEnrichedPrompt(activeHandoff.missionText, activeHandoff.researchContext, activeHandoff.agentId)
      : activeHandoff.missionText

    updateConfig(activeHandoff.agentId, { mission: planText })
    if (activeHandoff.agentId === 'kai' || activeHandoff.agentId === 'alex') {
      setBuilderPlanPrompt(planText)
    }
    adoptHandoff()
  }

  const selected = surfaces.find(s => s.id === selectedId) ?? surfaces[0]
  if (!selected) return null

  return (
    <div className="flex flex-col gap-5 pb-8">
      <StaggerList>

        {/* Header */}
        <StaggerItem>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: 'rgba(0,212,255,0.09)', border: '1px solid rgba(0,212,255,0.18)' }}>
                <Users className="h-4 w-4" style={{ color: '#00d4ff' }} />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: 'rgba(244,248,252,0.92)' }}>
                  Agent operations
                </p>
                <TruthBadge label={section.status} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-[10px] font-mono"
                title={currentHistory.source === 'local-demo-fallback' ? currentHistory.note : undefined}
                style={{ color: currentHistory.source === 'local-demo-fallback' ? 'rgba(255,107,53,0.55)' : 'rgba(192,232,240,0.38)', cursor: currentHistory.source === 'local-demo-fallback' ? 'help' : 'default' }}
              >
                Builder: {currentHistory.sourceLabel}
              </span>
              <button
                type="button"
                onClick={() => setFocusMode(v => !v)}
                disabled={!activeHandoff}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                style={{
                  color:      focusMode ? '#00d4ff' : 'rgba(192,232,240,0.55)',
                  background: focusMode ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border:     `1px solid ${focusMode ? 'rgba(0,212,255,0.22)' : 'rgba(255,255,255,0.09)'}`,
                  cursor:     activeHandoff ? 'pointer' : 'not-allowed',
                  opacity:    activeHandoff ? 1 : 0.32,
                  transition: 'color 0.15s, background 0.15s, border-color 0.15s',
                }}
              >
                {focusMode
                  ? <Maximize2 className="h-3 w-3" />
                  : <Minimize2 className="h-3 w-3" />
                }
                <span className="text-[9px] font-mono tracking-[0.14em]">
                  {focusMode ? 'EXIT FOCUS' : 'FOCUS'}
                </span>
              </button>
            </div>
          </div>
        </StaggerItem>

        {runHistory.note && <StaggerItem><WarningBanner text={runHistory.note} /></StaggerItem>}

        {/* Focus mode indicator — subtle strip shown when focused */}
        <AnimatePresence>
          {focusMode && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2"
              style={{
                background: 'rgba(0,212,255,0.04)',
                border:     '1px solid rgba(0,212,255,0.10)',
              }}
            >
              <Target className="h-3 w-3 flex-shrink-0" style={{ color: 'rgba(0,212,255,0.55)' }} />
              <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.55)' }}>
                FOCUS MODE  ·  OTHER PANELS HIDDEN
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Incoming missions inbox — shown when 2+ queued and one is active; hidden in focus mode */}
        {!focusMode && handoffQueue.length >= 2 && activeHandoff !== null && (
          <StaggerItem>
            <IncomingMissionsPanel
              queue={handoffQueue}
              activeHandoff={activeHandoff}
              onSelect={setActiveHandoff}
            />
          </StaggerItem>
        )}

        {/* Handoff banner */}
        <AnimatePresence>
          {activeHandoff && (
            <motion.div key={`handoff-${activeHandoff.createdAt}`}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
              <HandoffBanner
                handoff={activeHandoff}
                onAdopt={handleAdoptHandoff}
                onDismiss={dismissHandoff}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next mission hint — shown after adopt when queue still has items; hidden in focus mode */}
        <AnimatePresence>
          {!focusMode && activeHandoff === null && handoffQueue.length > 0 && (
            <motion.div key="next-hint"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              <NextMissionHint
                next={handoffQueue[0]}
                onOpen={() => setActiveHandoff(handoffQueue[0])}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Agent selector — compressed to single-agent indicator in focus mode */}
        <StaggerItem>
          {focusMode ? (() => {
            const style = PERSONA_STYLE[selected.id]
            const Icon  = style.Icon
            const mode  = toneForMode(selected.mode)
            return (
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: style.cardBg,
                  border:     `1px solid ${style.accent}30`,
                  transition: 'background 0.15s',
                }}
              >
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: style.iconBg, border: `1px solid ${style.accent}22` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: style.accent }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(244,248,252,0.96)' }}>
                    {selected.name}
                  </p>
                  <p className="text-[9px] font-mono tracking-[0.12em]" style={{ color: `${style.accent}99` }}>
                    {selected.roleTitle.toUpperCase()}
                  </p>
                </div>
                <Chip label={mode.label} color={mode.color} bg={mode.bg} border={mode.border} />
                <span
                  className="rounded px-2 py-0.5 text-[8px] font-mono tracking-[0.14em]"
                  style={{
                    color:      'rgba(0,212,255,0.65)',
                    background: 'rgba(0,212,255,0.07)',
                    border:     '1px solid rgba(0,212,255,0.16)',
                  }}
                >
                  FOCUSED
                </span>
              </div>
            )
          })() : (
            <AgentStrip surfaces={surfaces} selectedId={selected.id} onSelect={setSelectedId} />
          )}
        </StaggerItem>

        {/* Selected agent detail */}
        <StaggerItem>
          <AnimatePresence mode="wait">
            <motion.div key={selected.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}>
              <AgentDetail
                surface={selected}
                builderExecutionHistory={currentHistory}
                onBuilderExecutionHistoryChange={setCurrentHistory}
                onSetMode={m => setMode(selected.id, m)}
                onRoleTitleChange={v => updateConfig(selected.id, { roleTitle: v })}
                onMissionChange={v => updateConfig(selected.id, { mission: v })}
                onResponsibilitiesChange={v => setResponsibilities(selected.id, parseLineItems(v))}
                onFocusChange={id => {
                  const t = AGENT_FOCUS_OPTIONS.find(o => o.id === id)?.target
                  if (t) setFocusTarget(selected.id, t)
                }}
                onNotesChange={v => updateConfig(selected.id, { notes: v })}
                onToggleVisibleCapability={c => toggleVisibleCapability(selected.id, c)}
                onReset={() => resetConfig(selected.id)}
              />
            </motion.div>
          </AnimatePresence>
        </StaggerItem>

        {/* Execution history — hidden in focus mode */}
        {!focusMode && (
          <StaggerItem>
            <BuilderExecutionHistoryPanel history={currentHistory} />
          </StaggerItem>
        )}

        {!focusMode && section.warningLabels[0] && (
          <StaggerItem><WarningBanner text={section.warningLabels[0]} /></StaggerItem>
        )}

      </StaggerList>
    </div>
  )
}
