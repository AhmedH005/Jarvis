import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  BookOpen,
  Compass,
  FileSearch,
  LayoutGrid,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  Wrench,
} from 'lucide-react'
import type { AgentPersonaId } from '@/adapters/agent-control'
import type { MissionActionMode } from '@/store/mission-intake'
import { useMissionIntakeStore } from '@/store/mission-intake'
import {
  useMissionTemplatesStore,
  type MissionTemplate,
} from '@/store/mission-templates'
import { CountBadge, PanelHeader } from './shared'

// ── Style maps (mirror CommandCenterTab) ──────────────────────────────────────

const AGENT_STYLE: Record<AgentPersonaId, { accent: string }> = {
  alex:       { accent: '#ffb86b' },
  researcher: { accent: '#9ad1ff' },
  kai:        { accent: '#00ff88' },
  maya:       { accent: '#00d4ff' },
  noah:       { accent: '#ffd166' },
}

const AGENT_ICON: Record<AgentPersonaId, typeof Compass> = {
  alex:       Compass,
  researcher: Search,
  kai:        Wrench,
  maya:       ShieldCheck,
  noah:       Activity,
}

const ACTION_MODE_LABEL: Record<MissionActionMode, string> = {
  'plan-only':         'Plan only',
  'execution-request': 'Execution request',
  'verification':      'Verification',
  'remediation':       'Remediation',
  'ops-check':         'Ops check',
  'research':          'Gather context',
}

const ACTION_MODE_ICON: Record<MissionActionMode, typeof Compass> = {
  'plan-only':         Compass,
  'execution-request': Wrench,
  'verification':      ShieldCheck,
  'remediation':       FileSearch,
  'ops-check':         Activity,
  'research':          Search,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit',
    hour:  '2-digit', minute: '2-digit',
    hour12: false,
  }).format(d)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentChip({ agentId, agentName }: { agentId: AgentPersonaId; agentName: string }) {
  const { accent } = AGENT_STYLE[agentId]
  const Icon = AGENT_ICON[agentId]
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-mono"
      style={{
        color:      accent,
        background: `${accent}14`,
        border:     `1px solid ${accent}28`,
      }}
    >
      <Icon className="h-2.5 w-2.5" />
      {agentName}
    </span>
  )
}

function ModeChip({ mode }: { mode: MissionActionMode }) {
  const Icon = ACTION_MODE_ICON[mode]
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-mono"
      style={{
        color:      'rgba(192,232,240,0.65)',
        background: 'rgba(0,212,255,0.06)',
        border:     '1px solid rgba(0,212,255,0.13)',
      }}
    >
      <Icon className="h-2.5 w-2.5" style={{ color: '#00d4ff' }} />
      {ACTION_MODE_LABEL[mode]}
    </span>
  )
}

function TargetChip({ target }: { target: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-mono"
      style={{
        color:      'rgba(192,232,240,0.52)',
        background: 'rgba(255,255,255,0.03)',
        border:     '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <Target className="h-2.5 w-2.5" />
      {target}
    </span>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  canUpdate,
  onUse,
  onUpdate,
  onDelete,
}: {
  template:  MissionTemplate
  canUpdate: boolean
  onUse:     (t: MissionTemplate) => void
  onUpdate:  (t: MissionTemplate) => void
  onDelete:  (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="rounded-xl px-4 py-3.5"
      style={{
        background: 'rgba(255,255,255,0.022)',
        border:     '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Top row: name + starter badge */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <p
            className="text-[12px] font-mono leading-tight truncate"
            style={{ color: 'rgba(192,232,240,0.90)' }}
          >
            {template.name}
          </p>
          {template.source === 'starter' && (
            <span
              className="flex-shrink-0 rounded px-1.5 py-0.5 text-[7px] font-mono tracking-[0.14em]"
              style={{
                color:      'rgba(255,200,74,0.65)',
                background: 'rgba(255,200,74,0.07)',
                border:     '1px solid rgba(255,200,74,0.16)',
              }}
            >
              EXAMPLE
            </span>
          )}
        </div>

        {/* Delete / confirm */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {confirmDelete ? (
            <>
              <motion.button
                type="button"
                onClick={() => { onDelete(template.id); setConfirmDelete(false) }}
                className="rounded px-2 py-1 text-[8px] font-mono"
                style={{
                  color:      '#ff6b35',
                  background: 'rgba(255,107,53,0.10)',
                  border:     '1px solid rgba(255,107,53,0.22)',
                  cursor:     'pointer',
                }}
                whileTap={{ scale: 0.95 }}
              >
                CONFIRM
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded px-2 py-1 text-[8px] font-mono"
                style={{
                  color:      'rgba(192,232,240,0.45)',
                  background: 'rgba(255,255,255,0.03)',
                  border:     '1px solid rgba(255,255,255,0.07)',
                  cursor:     'pointer',
                }}
                whileTap={{ scale: 0.95 }}
              >
                CANCEL
              </motion.button>
            </>
          ) : (
            <motion.button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1"
              style={{
                color:      'rgba(192,232,240,0.28)',
                background: 'transparent',
                border:     '1px solid transparent',
                cursor:     'pointer',
              }}
              whileHover={{ color: '#ff6b35', borderColor: 'rgba(255,107,53,0.22)' }}
              whileTap={{ scale: 0.92 }}
            >
              <Trash2 className="h-3 w-3" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Chips */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <AgentChip agentId={template.recommendedAgentId} agentName={template.recommendedAgentName} />
        <ModeChip mode={template.actionMode} />
        {template.targetHint && <TargetChip target={template.targetHint} />}
      </div>

      {/* Mission text preview */}
      <p
        className="mb-3 text-[10px] leading-snug line-clamp-2"
        style={{ color: 'rgba(192,232,240,0.48)' }}
      >
        {template.missionText}
      </p>

      {/* Bottom row: timestamp + actions */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.28)' }}>
          updated {fmtDate(template.updatedAt)}
        </span>

        <div className="flex items-center gap-1.5">
          {canUpdate && (
            <motion.button
              type="button"
              onClick={() => onUpdate(template)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[8px] font-mono tracking-[0.12em]"
              style={{
                color:      'rgba(255,200,74,0.72)',
                background: 'rgba(255,200,74,0.07)',
                border:     '1px solid rgba(255,200,74,0.16)',
                cursor:     'pointer',
              }}
              whileHover={{ background: 'rgba(255,200,74,0.13)', borderColor: 'rgba(255,200,74,0.28)' }}
              whileTap={{ scale: 0.96 }}
            >
              <RefreshCw className="h-2.5 w-2.5" />
              UPDATE
            </motion.button>
          )}

          <motion.button
            type="button"
            onClick={() => onUse(template)}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[8px] font-mono tracking-[0.12em]"
            style={{
              color:      'rgba(0,212,255,0.85)',
              background: 'rgba(0,212,255,0.09)',
              border:     '1px solid rgba(0,212,255,0.22)',
              cursor:     'pointer',
            }}
            whileHover={{ background: 'rgba(0,212,255,0.16)', borderColor: 'rgba(0,212,255,0.36)' }}
            whileTap={{ scale: 0.96 }}
          >
            USE
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyTemplates() {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl px-6 py-7"
      style={{
        background: 'rgba(255,255,255,0.012)',
        border:     '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <LayoutGrid className="h-5 w-5" style={{ color: 'rgba(0,212,255,0.22)' }} />
      <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.38)' }}>
        No saved templates yet.
      </p>
      <p
        className="max-w-xs text-center text-[9px] font-mono"
        style={{ color: 'rgba(192,232,240,0.24)' }}
      >
        Parse a mission and use "Save as Template" to create your first reusable workflow.
      </p>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MissionTemplatesPanel() {
  const templates      = useMissionTemplatesStore((s) => s.templates)
  const deleteTemplate = useMissionTemplatesStore((s) => s.deleteTemplate)
  const updateTemplate = useMissionTemplatesStore((s) => s.updateTemplate)

  const { input, phase, route, setInput, parseRoute } = useMissionIntakeStore()

  const hasActiveRoute = (phase === 'parsed' || phase === 'handed-off') && route !== null

  function handleUse(t: MissionTemplate) {
    setInput(t.missionText)
    // parseRoute reads from the store's get(), which is updated synchronously by setInput
    parseRoute()
  }

  function handleUpdate(t: MissionTemplate) {
    if (!route || !input.trim()) return
    updateTemplate(t.id, t.name, {
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
  }

  const userTemplates    = templates.filter((t) => t.source === 'user-template')
  const starterTemplates = templates.filter((t) => t.source === 'starter')

  if (templates.length === 0) {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(4,10,18,0.65)',
          border:     '1px solid rgba(0,212,255,0.09)',
        }}
      >
        <PanelHeader
          Icon={BookOpen}
          title="MISSION TEMPLATES"
          sublabel="Reusable mission-routing patterns — no autonomous execution"
        />
        <div className="px-4 py-4">
          <EmptyTemplates />
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(4,10,18,0.65)',
        border:     '1px solid rgba(0,212,255,0.09)',
      }}
    >
      <PanelHeader
        Icon={BookOpen}
        title="MISSION TEMPLATES"
        sublabel="Reusable mission-routing patterns — no autonomous execution"
        badge={<CountBadge count={templates.length} />}
        right={
          hasActiveRoute ? (
            <span
              className="flex-shrink-0 rounded px-2 py-1 text-[8px] font-mono tracking-[0.12em]"
              style={{
                color:      'rgba(255,200,74,0.72)',
                background: 'rgba(255,200,74,0.06)',
                border:     '1px solid rgba(255,200,74,0.16)',
              }}
            >
              UPDATE AVAILABLE
            </span>
          ) : undefined
        }
      />

      {/* Body */}
      <div className="flex flex-col gap-2 px-4 py-4">

        {/* User templates */}
        {userTemplates.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[9px] font-mono tracking-[0.16em] px-1" style={{ color: 'rgba(0,212,255,0.45)' }}>
              YOUR TEMPLATES
            </p>
            <AnimatePresence initial={false}>
              {userTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  canUpdate={hasActiveRoute}
                  onUse={handleUse}
                  onUpdate={handleUpdate}
                  onDelete={deleteTemplate}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Starter templates */}
        {starterTemplates.length > 0 && (
          <div className="flex flex-col gap-2 mt-1">
            {userTemplates.length > 0 && (
              <div
                style={{
                  height:     1,
                  background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.10), transparent)',
                  margin:     '4px 0',
                }}
              />
            )}
            <p className="text-[9px] font-mono tracking-[0.16em] px-1" style={{ color: 'rgba(192,232,240,0.30)' }}>
              STARTER EXAMPLES
            </p>
            <AnimatePresence initial={false}>
              {starterTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  canUpdate={hasActiveRoute}
                  onUse={handleUse}
                  onUpdate={handleUpdate}
                  onDelete={deleteTemplate}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

      </div>

      {/* Truth footer */}
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <BookOpen className="h-3 w-3 flex-shrink-0" style={{ color: 'rgba(0,212,255,0.38)' }} />
        <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'rgba(192,232,240,0.36)' }}>
          Templates save routing intent only. USE loads the mission text and parses a suggested route.
          No execution is triggered automatically.
        </p>
      </div>
    </div>
  )
}
