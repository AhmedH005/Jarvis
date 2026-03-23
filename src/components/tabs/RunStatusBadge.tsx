import { motion } from 'framer-motion'
import type { AgentRunStatus } from '@/adapters/run-history'

const STATUS_CONFIG: Record<AgentRunStatus, {
  label: string
  color: string
  bg: string
  border: string
  glow: string
  pulse?: boolean
}> = {
  started: {
    label: 'STARTED',
    color: '#00d4ff',
    bg: 'rgba(0,212,255,0.08)',
    border: 'rgba(0,212,255,0.24)',
    glow: 'rgba(0,212,255,0.2)',
    pulse: true,
  },
  completed: {
    label: 'COMPLETED',
    color: '#00ff88',
    bg: 'rgba(0,255,136,0.08)',
    border: 'rgba(0,255,136,0.24)',
    glow: 'rgba(0,255,136,0.2)',
    pulse: true,
  },
  failed: {
    label: 'FAILED',
    color: '#ff6b35',
    bg: 'rgba(255,107,53,0.08)',
    border: 'rgba(255,107,53,0.24)',
    glow: 'rgba(255,107,53,0.18)',
  },
  blocked: {
    label: 'BLOCKED',
    color: '#ff9a54',
    bg: 'rgba(255,154,84,0.08)',
    border: 'rgba(255,154,84,0.22)',
    glow: 'rgba(255,154,84,0.16)',
  },
  'approval-needed': {
    label: 'APPROVAL',
    color: '#ffc84a',
    bg: 'rgba(255,200,74,0.08)',
    border: 'rgba(255,200,74,0.24)',
    glow: 'rgba(255,200,74,0.16)',
  },
}

export function RunStatusBadge({ status }: { status: AgentRunStatus }) {
  const cfg = STATUS_CONFIG[status]

  return (
    <span
      className="inline-flex items-center gap-1 rounded font-mono tracking-widest select-none"
      style={{
        fontSize: '9px',
        padding: '2px 6px',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 0 6px ${cfg.glow}`,
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
