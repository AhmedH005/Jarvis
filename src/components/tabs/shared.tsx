/**
 * Shared primitives used across all tab content components.
 *
 * Visual tokens used throughout:
 *   panel bg          rgba(4,10,18,0.65)   + border rgba(0,212,255,0.09)
 *   section border    rgba(0,212,255,0.07)
 *   title text        rgba(192,232,240,0.88)
 *   sublabel text     rgba(192,232,240,0.36)
 *   dim text          rgba(192,232,240,0.42)
 *   accent cyan       #00d4ff
 *   accent green      #00ff88
 *   accent amber      #ffc84a
 *   accent red        #ff6b35
 */

import { type ReactNode, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, XOctagon, Clock } from 'lucide-react'
import type { ActionCapability } from '@/lib/action-capability'

// ── Panel header ───────────────────────────────────────────────────────────────
// Consistent icon + title + sublabel row for top of panel sections.
// Optionally accepts a badge node (count pill, status chip) and a right slot
// (e.g. kind-summary dots, filter counts).

interface PanelHeaderProps {
  Icon:        typeof Clock
  iconColor?:  string
  iconBg?:     string
  iconBorder?: string
  title:       string
  sublabel?:   string
  badge?:      ReactNode   // e.g. count chip next to title
  right?:      ReactNode   // e.g. kind summary row at far right
}

export function PanelHeader({
  Icon,
  iconColor  = '#00d4ff',
  iconBg     = 'rgba(0,212,255,0.09)',
  iconBorder = 'rgba(0,212,255,0.18)',
  title,
  sublabel,
  badge,
  right,
}: PanelHeaderProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-4"
      style={{ borderBottom: '1px solid rgba(0,212,255,0.07)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: iconBg, border: `1px solid ${iconBorder}` }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p
              className="text-[11px] font-mono tracking-[0.18em]"
              style={{ color: 'rgba(192,232,240,0.88)' }}
            >
              {title}
            </p>
            {badge}
          </div>
          {sublabel && (
            <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
              {sublabel}
            </p>
          )}
        </div>
      </div>
      {right && (
        <div className="flex-shrink-0">{right}</div>
      )}
    </div>
  )
}

// ── Count badge ────────────────────────────────────────────────────────────────
// Shared count pill — used on panel headers and filter pills.

export function CountBadge({ count, urgent = false }: { count: number; urgent?: boolean }) {
  if (count === 0) return null
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[9px] font-mono tabular-nums"
      style={{
        color:      urgent ? '#ff6b35' : 'rgba(192,232,240,0.72)',
        background: urgent ? 'rgba(255,107,53,0.12)' : 'rgba(192,232,240,0.08)',
        border:     `1px solid ${urgent ? 'rgba(255,107,53,0.22)' : 'rgba(192,232,240,0.14)'}`,
      }}
    >
      {count}
    </span>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

interface CardProps {
  title?:     string
  children:   ReactNode
  className?: string
  accent?:    string   // border-top accent color
}

export function Card({ title, children, accent }: CardProps) {
  return (
    <div
      className="rounded-xl flex flex-col overflow-hidden"
      style={{
        background: 'rgba(0,212,255,0.025)',
        border:     '1px solid rgba(0,212,255,0.1)',
        borderTop:  accent ? `2px solid ${accent}` : '1px solid rgba(0,212,255,0.1)',
      }}
    >
      {title && (
        <div
          className="px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,212,255,0.07)' }}
        >
          <p
            className="text-[10px] font-mono tracking-widest uppercase"
            style={{ color: 'rgba(0,212,255,0.6)' }}
          >
            {title}
          </p>
        </div>
      )}
      <div className="px-4 py-3 flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}

// ── Field row ──────────────────────────────────────────────────────────────────

interface FieldRowProps {
  label:       string
  value:       ReactNode
  valueColor?: string
  mono?:       boolean
}

export function FieldRow({ label, value, valueColor, mono = false }: FieldRowProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span
        className="text-[10px] font-mono flex-shrink-0"
        style={{ color: 'rgba(192,232,240,0.38)', minWidth: 90 }}
      >
        {label}
      </span>
      <span
        className={`text-[10px] text-right leading-snug ${mono ? 'font-mono' : ''}`}
        style={{ color: valueColor ?? 'rgba(192,232,240,0.75)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Inline list ────────────────────────────────────────────────────────────────

export function ItemList({ items, color }: { items: string[]; color?: string }) {
  return (
    <ul className="flex flex-col gap-1 mt-0.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="text-[10px] font-mono flex-shrink-0 mt-px" style={{ color: color ?? '#00d4ff' }}>›</span>
          <span className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.7)' }}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ── Warning banner ─────────────────────────────────────────────────────────────

export function WarningBanner({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5"
      style={{
        background: 'rgba(255,200,74,0.06)',
        border:     '1px solid rgba(255,200,74,0.18)',
      }}
    >
      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#ffc84a' }} />
      <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
        {text}
      </p>
    </div>
  )
}

// ── Blocked banner ─────────────────────────────────────────────────────────────

export function BlockedBanner({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5"
      style={{
        background: 'rgba(255,107,53,0.06)',
        border:     '1px solid rgba(255,107,53,0.2)',
      }}
    >
      <XOctagon className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#ff6b35' }} />
      <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(255,107,53,0.85)' }}>
        {text}
      </p>
    </div>
  )
}

// ── Future banner ──────────────────────────────────────────────────────────────

export function FutureBanner({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5"
      style={{
        background: 'rgba(192,232,240,0.03)',
        border:     '1px solid rgba(192,232,240,0.1)',
      }}
    >
      <Clock className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: 'rgba(192,232,240,0.4)' }} />
      <p className="text-[10px] leading-snug font-mono" style={{ color: 'rgba(192,232,240,0.45)' }}>
        {text}
      </p>
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────
// Small tracking label above groups: "SUGGESTED ROUTE", "EXAMPLE MISSIONS", etc.

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9px] font-mono tracking-[0.2em]" style={{ color: 'rgba(0,212,255,0.50)' }}>
      {children}
    </p>
  )
}

// ── Empty panel ────────────────────────────────────────────────────────────────
// Consistent styled empty-state for panels with no data yet.

export function EmptyPanel({
  icon: Icon,
  title,
  note,
}: {
  icon?:  typeof Clock
  title:  string
  note?:  string
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl px-6 py-8"
      style={{
        background: 'rgba(255,255,255,0.012)',
        border:     '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {Icon && <Icon className="h-5 w-5" style={{ color: 'rgba(0,212,255,0.22)' }} />}
      <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.40)' }}>
        {title}
      </p>
      {note && (
        <p className="max-w-xs text-center text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.24)' }}>
          {note}
        </p>
      )}
    </div>
  )
}

// ── Section divider ────────────────────────────────────────────────────────────

export function Divider() {
  return (
    <div
      style={{
        height:     1,
        background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.12), transparent)',
        margin:     '4px 0',
      }}
    />
  )
}

// ── Capability pill list ───────────────────────────────────────────────────────

interface CapabilityListProps {
  items:     string[]
  color:     string
  dimColor?: string
}

export function CapabilityList({ items, color }: CapabilityListProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className="text-[9px] font-mono rounded px-2 py-0.5"
          style={{
            color,
            background: `${color}11`,
            border:     `1px solid ${color}28`,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

// ── Fade-in wrapper ────────────────────────────────────────────────────────────

export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// ── Stagger container ──────────────────────────────────────────────────────────

export function StaggerList({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="flex flex-col gap-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden:  { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden:  { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
      }}
    >
      {children}
    </motion.div>
  )
}

// ── Action chip ─────────────────────────────────────────────────────────────────
// Compact contextual action button used on queue rows, activity events,
// and history entries to expose the next truthful action without adding bulk.
//
// capability:
//   'real'        — direct action, full visual weight
//   'navigational'— opens the relevant panel; slightly muted opacity (0.78)
//   'blocked'     — action unavailable; greyed, shows reason on click
//
// feedbackNote:
//   Brief text shown inline for ~1.3 s after click to confirm the interaction.

export function ActionChip({
  label,
  Icon,
  accent = '#00d4ff',
  capability = 'navigational',
  feedbackNote,
  onClick,
}: {
  label:         string
  Icon?:         typeof Clock
  accent?:       string
  capability?:   ActionCapability
  feedbackNote?: string
  onClick:       () => void
}) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()

    if (capability === 'blocked') {
      const note = feedbackNote ?? 'Unavailable right now.'
      setFeedback(note)
      setTimeout(() => setFeedback(null), 2200)
      return
    }

    const note = feedbackNote ?? 'Opening…'
    setFeedback(note)
    setTimeout(() => setFeedback(null), 1300)
    onClick()
  }, [capability, feedbackNote, onClick])

  const isBlocked      = capability === 'blocked'
  const isNavigational = capability === 'navigational'

  const effectiveAccent = isBlocked ? 'rgba(192,232,240,0.28)' : accent
  const baseOpacity     = isNavigational ? 0.78 : 1

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <motion.button
        type="button"
        onClick={handleClick}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[8px] font-mono tracking-[0.12em]"
        style={{
          color:      effectiveAccent,
          background: `${effectiveAccent}16`,
          border:     `1px solid ${effectiveAccent}32`,
          cursor:     isBlocked ? 'not-allowed' : 'pointer',
          opacity:    baseOpacity,
        }}
        whileHover={!isBlocked ? { background: `${effectiveAccent}28`, borderColor: `${effectiveAccent}55`, opacity: 1 } : {}}
        whileTap={!isBlocked ? { scale: 0.95 } : {}}
      >
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
      </motion.button>

      {/* Inline feedback note — appears below chip, auto-clears */}
      {feedback && (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
          className="text-[8px] font-mono"
          style={{
            color:        isBlocked ? 'rgba(255,107,53,0.65)' : `${accent}99`,
            paddingRight: 2,
          }}
        >
          {feedback}
        </motion.span>
      )}
    </span>
  )
}
