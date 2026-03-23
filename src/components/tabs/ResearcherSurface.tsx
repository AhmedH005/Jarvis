import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  GitBranch,
  List,
  PenLine,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useResearcherStore } from '@/store/researcher'
import type { ResearcherState } from '@/store/researcher'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import type { ResearchContext } from '@/store/mission-handoff'
import { FadeIn, ItemList, SectionLabel } from './shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLines(raw: string): string[] {
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)
}

// ── Shared textarea field ─────────────────────────────────────────────────────

function BriefTextarea({
  label,
  icon: Icon,
  placeholder,
  value,
  onChange,
  accent,
  rows = 3,
}: {
  label:       string
  icon:        typeof Search
  placeholder: string
  value:       string
  onChange:    (v: string) => void
  accent:      string
  rows?:       number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-2.5 w-2.5 flex-shrink-0" style={{ color: accent }} />
        <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: `${accent}99` }}>
          {label}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-lg px-3 py-2.5 text-[10px] font-mono leading-relaxed outline-none"
        style={{
          background: 'rgba(0,0,0,0.28)',
          border:     `1px solid ${accent}22`,
          color:      'rgba(192,232,240,0.82)',
          caretColor: accent,
        }}
      />
    </div>
  )
}

// ── Draft structure notice ────────────────────────────────────────────────────

function DraftNotice({ accent }: { accent: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2"
      style={{
        background: 'rgba(255,200,74,0.05)',
        border:     '1px solid rgba(255,200,74,0.14)',
      }}
    >
      <Sparkles className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" style={{ color: 'rgba(255,200,74,0.65)' }} />
      <p className="text-[8px] font-mono leading-relaxed" style={{ color: 'rgba(255,200,74,0.65)' }}>
        DRAFT STRUCTURE — generated from your question, not from verified research.
        Edit every field before completing.
      </p>
    </div>
  )
}

// ── Idle phase ────────────────────────────────────────────────────────────────

function IdleView({ store, accent }: { store: ResearcherState; accent: string }) {
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const hasPrompt  = store.prompt.trim().length > 0

  return (
    <FadeIn>
      <div className="flex flex-col gap-3">

        {/* Question input */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Search className="h-2.5 w-2.5 flex-shrink-0" style={{ color: accent }} />
            <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: `${accent}99` }}>
              RESEARCH QUESTION
            </span>
          </div>
          <textarea
            ref={inputRef}
            value={store.prompt}
            onChange={(e) => store.setPrompt(e.target.value)}
            placeholder={'What do you need to figure out?\ne.g. "Compare local-first vs server-sync for the calendar feature"'}
            rows={4}
            className="w-full resize-none rounded-lg px-3 py-2.5 text-[10px] font-mono leading-relaxed outline-none"
            style={{
              background: 'rgba(0,0,0,0.28)',
              border:     `1px solid ${accent}22`,
              color:      'rgba(192,232,240,0.82)',
              caretColor: accent,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (hasPrompt) store.scaffoldBrief()
              }
            }}
          />
        </div>

        {/* Primary: SCAFFOLD BRIEF */}
        <motion.button
          type="button"
          onClick={() => store.scaffoldBrief()}
          disabled={!hasPrompt}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[9px] font-mono tracking-[0.16em]"
          style={{
            color:      hasPrompt ? accent : 'rgba(192,232,240,0.28)',
            background: hasPrompt ? `${accent}14` : 'rgba(255,255,255,0.02)',
            border:     `1px solid ${hasPrompt ? `${accent}36` : 'rgba(255,255,255,0.06)'}`,
            cursor:     hasPrompt ? 'pointer' : 'not-allowed',
          }}
          whileHover={hasPrompt ? { background: `${accent}22`, borderColor: `${accent}55` } : {}}
          whileTap={hasPrompt ? { scale: 0.98 } : {}}
        >
          <Sparkles className="h-3 w-3" />
          SCAFFOLD BRIEF
        </motion.button>

        {/* Secondary: start blank */}
        <div className="flex items-center justify-between">
          <motion.button
            type="button"
            onClick={() => store.startBrief()}
            disabled={!hasPrompt}
            className="text-[8px] font-mono"
            style={{
              color:      hasPrompt ? 'rgba(192,232,240,0.35)' : 'rgba(192,232,240,0.18)',
              background: 'transparent',
              border:     'none',
              cursor:     hasPrompt ? 'pointer' : 'not-allowed',
              padding:    0,
            }}
            whileHover={hasPrompt ? { color: 'rgba(192,232,240,0.58)' } : {}}
          >
            or start blank →
          </motion.button>
          <p className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.20)' }}>
            ⌘↵ to scaffold
          </p>
        </div>

        {/* Help note */}
        <div
          className="rounded-lg px-3 py-2.5"
          style={{
            background: 'rgba(255,255,255,0.013)',
            border:     '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'rgba(192,232,240,0.34)' }}>
            SCAFFOLD BRIEF drafts a thinking structure from your question — questions to investigate,
            comparison angles, trade-off prompts. Edit before completing, then hand off to Alex or Kai.
          </p>
        </div>

      </div>
    </FadeIn>
  )
}

// ── Briefing phase ────────────────────────────────────────────────────────────

function BriefingView({ store, accent }: { store: ResearcherState; accent: string }) {
  const brief = store.brief!

  const keyFindingsRaw = brief.keyFindings.join('\n')
  const tradeoffsRaw   = brief.tradeoffs.join('\n')
  const canComplete    = brief.summary.trim().length > 0

  // Options: simple key=value textarea representation: "label :: description"
  const optionsRaw = brief.options
    .map((o) => o.label + (o.description ? ` :: ${o.description}` : ''))
    .join('\n')

  function parseOptions(raw: string) {
    return parseLines(raw).map((line) => {
      const parts = line.split('::')
      return { label: parts[0].trim(), description: (parts[1] ?? '').trim() }
    })
  }

  const keyFindingsLabel = brief.scaffolded ? 'QUESTIONS TO INVESTIGATE  (one per line)' : 'KEY FINDINGS  (one per line)'
  const keyFindingsPlaceholder = brief.scaffolded
    ? 'Edit or add your own questions to investigate...'
    : 'What did you find? One finding per line...'

  return (
    <FadeIn>
      <div className="flex flex-col gap-3">

        {/* Question chip */}
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5"
          style={{ background: `${accent}0a`, border: `1px solid ${accent}22` }}
        >
          <Search className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" style={{ color: accent }} />
          <p className="text-[9px] font-mono leading-relaxed" style={{ color: `${accent}cc` }}>
            {brief.prompt}
          </p>
        </div>

        {/* Draft notice (only when scaffolded) */}
        {brief.scaffolded && <DraftNotice accent={accent} />}

        {/* Summary */}
        <BriefTextarea
          label="SUMMARY"
          icon={PenLine}
          placeholder="One-paragraph framing of the question and current understanding..."
          value={brief.summary}
          onChange={(v) => store.updateField({ summary: v })}
          accent={accent}
          rows={2}
        />

        {/* Key questions / findings */}
        <BriefTextarea
          label={keyFindingsLabel}
          icon={List}
          placeholder={keyFindingsPlaceholder}
          value={keyFindingsRaw}
          onChange={(v) => store.updateField({ keyFindings: parseLines(v) })}
          accent={accent}
        />

        {/* Options (only show if non-empty or scaffolded with options) */}
        {(brief.options.length > 0 || brief.scaffolded) && (
          <BriefTextarea
            label={'OPTIONS  (label :: description, one per line)'}
            icon={GitBranch}
            placeholder={'Option A :: describe this approach\nOption B :: describe this approach'}
            value={optionsRaw}
            onChange={(v) => store.updateField({ options: parseOptions(v) })}
            accent={accent}
          />
        )}

        {/* Trade-offs */}
        <BriefTextarea
          label="TRADE-OFFS  (one per line)"
          icon={Scale}
          placeholder={'Short-term vs long-term cost\nDeveloper experience vs runtime performance'}
          value={tradeoffsRaw}
          onChange={(v) => store.updateField({ tradeoffs: parseLines(v) })}
          accent={accent}
        />

        {/* Recommended route selector */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-2.5 w-2.5 flex-shrink-0" style={{ color: accent }} />
            <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: `${accent}99` }}>
              RECOMMENDED NEXT ROUTE
            </span>
          </div>
          <div className="flex gap-2">
            {(
              [
                { agentId: 'alex', agentName: 'Alex', label: 'PLAN FIRST', Icon: Compass },
                { agentId: 'kai',  agentName: 'Kai',  label: 'BUILD IT',   Icon: Wrench },
              ] as const
            ).map(({ agentId, agentName, label, Icon }) => {
              const selected = brief.recommendedRoute?.agentId === agentId
              return (
                <motion.button
                  key={agentId}
                  type="button"
                  onClick={() =>
                    store.updateField({
                      recommendedRoute: selected ? null : { agentId, agentName, rationale: '' },
                    })
                  }
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[9px] font-mono tracking-[0.12em]"
                  style={{
                    color:      selected ? accent : 'rgba(192,232,240,0.35)',
                    background: selected ? `${accent}18` : 'rgba(255,255,255,0.022)',
                    border:     `1px solid ${selected ? `${accent}44` : 'rgba(255,255,255,0.07)'}`,
                    cursor:     'pointer',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {label}
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex gap-2 pt-1">
          <motion.button
            type="button"
            onClick={() => store.clearBrief()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[8px] font-mono"
            style={{
              color:      'rgba(192,232,240,0.35)',
              background: 'rgba(255,255,255,0.02)',
              border:     '1px solid rgba(255,255,255,0.06)',
              cursor:     'pointer',
            }}
            whileTap={{ scale: 0.97 }}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            DISCARD
          </motion.button>

          <motion.button
            type="button"
            onClick={() => store.completeBrief()}
            disabled={!canComplete}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-mono tracking-[0.12em]"
            style={{
              color:      canComplete ? accent : 'rgba(192,232,240,0.28)',
              background: canComplete ? `${accent}14` : 'rgba(255,255,255,0.02)',
              border:     `1px solid ${canComplete ? `${accent}36` : 'rgba(255,255,255,0.06)'}`,
              cursor:     canComplete ? 'pointer' : 'not-allowed',
            }}
            whileHover={canComplete ? { background: `${accent}22`, borderColor: `${accent}55` } : {}}
            whileTap={canComplete ? { scale: 0.98 } : {}}
          >
            <CheckCircle2 className="h-3 w-3" />
            COMPLETE BRIEF
          </motion.button>
        </div>

      </div>
    </FadeIn>
  )
}

// ── Complete phase ────────────────────────────────────────────────────────────

function CompleteView({ store, accent }: { store: ResearcherState; accent: string }) {
  const brief      = store.brief!
  const setHandoff = useMissionHandoffStore((s) => s.setHandoff)

  function handoffTo(agentId: 'alex' | 'kai') {
    const agentName   = agentId === 'alex' ? 'Alex' : 'Kai'
    const actionMode  = agentId === 'alex' ? 'plan-only' : 'execution-request'
    const actionLabel = agentId === 'alex' ? 'Generate plan' : 'Create execution request'

    const researchContext: ResearchContext = {
      summary:     brief.summary,
      keyFindings: brief.keyFindings,
      options:     brief.options,
      tradeoffs:   brief.tradeoffs,
      scaffolded:  brief.scaffolded,
    }

    setHandoff({
      missionText: brief.prompt,
      agentId,
      agentName,
      actionMode,
      actionLabel,
      targetHint:  null,
      targetId:    null,
      rationale:   brief.summary
        ? `Researcher brief: ${brief.summary.slice(0, 160)}${brief.summary.length > 160 ? '…' : ''}`
        : `From Researcher brief on: ${brief.prompt.slice(0, 120)}`,
      ambiguous:      false,
      source:         'researcher',
      createdAt:      new Date().toISOString(),
      researchContext,
    })
  }

  return (
    <FadeIn>
      <div className="flex flex-col gap-3">

        {/* Question */}
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5"
          style={{ background: `${accent}0a`, border: `1px solid ${accent}22` }}
        >
          <Search className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" style={{ color: accent }} />
          <p className="text-[9px] font-mono leading-relaxed" style={{ color: `${accent}cc` }}>
            {brief.prompt}
          </p>
        </div>

        {/* Summary */}
        {brief.summary && (
          <div className="flex flex-col gap-1">
            <SectionLabel><span style={{ color: `${accent}88` }}>SUMMARY</span></SectionLabel>
            <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(192,232,240,0.78)' }}>
              {brief.summary}
            </p>
          </div>
        )}

        {/* Key questions / findings */}
        {brief.keyFindings.length > 0 && (
          <div className="flex flex-col gap-1">
            <SectionLabel>
              <span style={{ color: `${accent}88` }}>
                {brief.scaffolded ? 'QUESTIONS TO INVESTIGATE' : 'KEY FINDINGS'}
              </span>
            </SectionLabel>
            <ItemList items={brief.keyFindings} color={accent} />
          </div>
        )}

        {/* Options */}
        {brief.options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel><span style={{ color: `${accent}88` }}>OPTIONS</span></SectionLabel>
            <div className="flex flex-col gap-1.5">
              {brief.options.map((opt, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.018)',
                    border:     `1px solid ${accent}18`,
                  }}
                >
                  <p className="text-[9px] font-mono" style={{ color: accent }}>{opt.label}</p>
                  {opt.description && (
                    <p className="mt-0.5 text-[9px] leading-snug" style={{ color: 'rgba(192,232,240,0.52)' }}>
                      {opt.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade-offs */}
        {brief.tradeoffs.length > 0 && (
          <div className="flex flex-col gap-1">
            <SectionLabel><span style={{ color: `${accent}88` }}>TRADE-OFFS</span></SectionLabel>
            <ItemList items={brief.tradeoffs} color="rgba(255,200,74,0.72)" />
          </div>
        )}

        {/* Recommended route */}
        {brief.recommendedRoute && (
          <div className="flex flex-col gap-1">
            <SectionLabel><span style={{ color: `${accent}88` }}>RECOMMENDED NEXT ROUTE</span></SectionLabel>
            <div className="flex items-start gap-2">
              <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5" style={{ color: accent }} />
              <div>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
                  {brief.recommendedRoute.agentName === 'Alex' ? 'Alex — Plan first' : 'Kai — Build it'}
                </span>
                {brief.recommendedRoute.rationale && (
                  <p className="mt-0.5 text-[9px] leading-snug" style={{ color: 'rgba(192,232,240,0.42)' }}>
                    {brief.recommendedRoute.rationale}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Handoff block */}
        <div
          className="flex flex-col gap-2 rounded-lg px-3 py-3 mt-1"
          style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[8px] font-mono tracking-[0.16em]" style={{ color: 'rgba(192,232,240,0.35)' }}>
            HAND OFF TO
          </p>
          <div className="flex gap-2">
            <motion.button
              type="button"
              onClick={() => handoffTo('alex')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-mono tracking-[0.10em]"
              style={{
                color:      '#ffb86b',
                background: 'rgba(255,184,107,0.09)',
                border:     '1px solid rgba(255,184,107,0.22)',
                cursor:     'pointer',
              }}
              whileHover={{ background: 'rgba(255,184,107,0.16)', borderColor: 'rgba(255,184,107,0.36)' }}
              whileTap={{ scale: 0.97 }}
            >
              <Compass className="h-3 w-3" />
              ALEX  ·  PLAN
              <ArrowRight className="h-2.5 w-2.5" />
            </motion.button>

            <motion.button
              type="button"
              onClick={() => handoffTo('kai')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-mono tracking-[0.10em]"
              style={{
                color:      '#00ff88',
                background: 'rgba(0,255,136,0.08)',
                border:     '1px solid rgba(0,255,136,0.20)',
                cursor:     'pointer',
              }}
              whileHover={{ background: 'rgba(0,255,136,0.14)', borderColor: 'rgba(0,255,136,0.36)' }}
              whileTap={{ scale: 0.97 }}
            >
              <Wrench className="h-3 w-3" />
              KAI  ·  BUILD
              <ArrowRight className="h-2.5 w-2.5" />
            </motion.button>
          </div>
          <p className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.22)' }}>
            Sends the question to the agent's mission intake. No autonomous execution is triggered.
          </p>
        </div>

        {/* Edit / new row */}
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={() => store.editBrief()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[8px] font-mono"
            style={{
              color:      'rgba(192,232,240,0.45)',
              background: 'rgba(255,255,255,0.022)',
              border:     '1px solid rgba(255,255,255,0.07)',
              cursor:     'pointer',
            }}
            whileTap={{ scale: 0.97 }}
          >
            <PenLine className="h-2.5 w-2.5" />
            EDIT BRIEF
          </motion.button>

          <motion.button
            type="button"
            onClick={() => store.clearBrief()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[8px] font-mono"
            style={{
              color:      'rgba(192,232,240,0.28)',
              background: 'rgba(255,255,255,0.015)',
              border:     '1px solid rgba(255,255,255,0.05)',
              cursor:     'pointer',
            }}
            whileTap={{ scale: 0.97 }}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            NEW
          </motion.button>
        </div>

      </div>
    </FadeIn>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ResearcherSurface({ accent }: { accent: string }) {
  const store = useResearcherStore()

  return (
    <div className="flex flex-col gap-3">

      {/* Section label + phase badge */}
      <div className="flex items-center gap-1.5">
        <Search className="h-2.5 w-2.5 flex-shrink-0" style={{ color: accent }} />
        <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: `${accent}99` }}>
          RESEARCH BRIEF
        </span>
        {store.phase !== 'idle' && (
          <span
            className="rounded px-1.5 py-0.5 text-[7px] font-mono tracking-[0.14em]"
            style={{
              color:      store.phase === 'complete' ? '#00ff88' : accent,
              background: store.phase === 'complete' ? 'rgba(0,255,136,0.08)' : `${accent}10`,
              border:     `1px solid ${store.phase === 'complete' ? 'rgba(0,255,136,0.20)' : `${accent}28`}`,
            }}
          >
            {store.phase === 'complete' ? 'COMPLETE' : 'IN PROGRESS'}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {store.phase === 'idle' && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <IdleView store={store} accent={accent} />
          </motion.div>
        )}
        {store.phase === 'briefing' && (
          <motion.div key="briefing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <BriefingView store={store} accent={accent} />
          </motion.div>
        )}
        {store.phase === 'complete' && (
          <motion.div key="complete"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <CompleteView store={store} accent={accent} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
