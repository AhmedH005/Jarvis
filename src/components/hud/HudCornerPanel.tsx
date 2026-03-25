import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Props {
  title:     string
  children:  React.ReactNode
  engaged?:  boolean
  className?: string
  delay?:    number
}

/**
 * HudCornerPanel — Stark-style bordered corner HUD box.
 *
 * Visual spec from Stark Systems:
 *   - Dark semi-transparent background
 *   - 1px border, --primary color at ~0.2 opacity (dim), ~0.4 engaged
 *   - Small colored title label (all-caps, letter-spaced)
 *   - Content: monospace, small text
 *   - filter brightness(1.4) when engaged
 */
export function HudCornerPanel({ title, children, engaged = false, className, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 20, mass: 0.8, delay }}
      className={cn('relative', className)}
      style={{
        background:  'rgba(0,212,255,0.04)',
        border:      `1px solid ${engaged ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.18)'}`,
        padding:     '10px 14px 12px',
        minWidth:    160,
        borderRadius: 6,
        filter:      engaged ? 'brightness(1.4)' : 'brightness(1)',
        transition:  'border-color 0.6s ease, filter 0.6s ease, box-shadow 0.6s ease',
        boxShadow:   engaged ? '0 0 20px rgba(0,212,255,0.08)' : 'none',
      }}
    >
      {/* Title */}
      <p
        className="text-[10px] font-mono tracking-[0.22em] mb-2"
        style={{
          color:         '#00d4ff',
          textShadow:    '0 0 8px rgba(0,212,255,0.5)',
          letterSpacing: '0.18em',
        }}
      >
        {title}
      </p>
      <div className="space-y-1">
        {children}
      </div>
    </motion.div>
  )
}

/** Single data row inside a HudCornerPanel */
export function PanelRow({
  label,
  value,
  valueColor,
  highlight,
}: {
  label:       string
  value:       string
  valueColor?: string
  highlight?:  boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[11px] font-mono">
      <span style={{ color: 'rgba(192,232,240,0.6)' }}>{label}:</span>
      <span
        style={{
          color:      valueColor ?? (highlight ? '#00d4ff' : 'rgba(192,232,240,0.9)'),
          textShadow: highlight ? '0 0 8px rgba(0,212,255,0.6)' : 'none',
          fontWeight: highlight ? 500 : 400,
        }}
      >
        {value}
      </span>
    </div>
  )
}
