import { motion } from 'framer-motion'
import type { TruthLabel } from '@/adapters/backend-files'

const BADGE_CONFIG: Record<TruthLabel, {
  label:      string
  color:      string
  bg:         string
  border:     string
  glow:       string
  pulse?:     boolean
}> = {
  live: {
    label:  'LIVE',
    color:  '#00ff88',
    bg:     'rgba(0,255,136,0.08)',
    border: 'rgba(0,255,136,0.25)',
    glow:   'rgba(0,255,136,0.3)',
    pulse:  true,
  },
  partial: {
    label:  'PARTIAL',
    color:  '#ffc84a',
    bg:     'rgba(255,200,74,0.08)',
    border: 'rgba(255,200,74,0.25)',
    glow:   'rgba(255,200,74,0.2)',
  },
  blocked: {
    label:  'BLOCKED',
    color:  '#ff6b35',
    bg:     'rgba(255,107,53,0.08)',
    border: 'rgba(255,107,53,0.25)',
    glow:   'rgba(255,107,53,0.2)',
  },
  future: {
    label:  'FUTURE',
    color:  'rgba(192,232,240,0.45)',
    bg:     'rgba(192,232,240,0.04)',
    border: 'rgba(192,232,240,0.12)',
    glow:   'none',
  },
}

interface TruthBadgeProps {
  label:  TruthLabel
  size?:  'sm' | 'md'
  className?: string
}

export function TruthBadge({ label, size = 'sm' }: TruthBadgeProps) {
  const cfg = BADGE_CONFIG[label]
  const isSm = size === 'sm'

  return (
    <span
      className="inline-flex items-center gap-1 rounded font-mono tracking-widest select-none"
      style={{
        fontSize:   isSm ? '9px' : '10px',
        padding:    isSm ? '2px 6px' : '3px 8px',
        color:      cfg.color,
        background: cfg.bg,
        border:     `1px solid ${cfg.border}`,
        boxShadow:  cfg.glow !== 'none' ? `0 0 6px ${cfg.glow}` : 'none',
      }}
    >
      {cfg.pulse && (
        <motion.span
          className="inline-block rounded-full"
          style={{ width: 5, height: 5, background: cfg.color, flexShrink: 0 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {cfg.label}
    </span>
  )
}
