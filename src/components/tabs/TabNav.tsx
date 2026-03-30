import type { FC } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Command,
  Coins,
  Code2,
  Database,
  HardDrive,
  Mail,
  Mic2,
  Shield,
  Sparkles,
  TimerReset,
} from 'lucide-react'
import type { TabId } from '@/adapters/backend-files'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (id: TabId) => void
}

const NAV_ITEMS: { id: TabId; label: string; icon: FC<{ className?: string }>; description: string }[] = [
  { id: 'command',   label: 'Command',   icon: Command,   description: 'Route natural language' },
  { id: 'time',      label: 'Time',      icon: TimerReset, description: 'Schedule + tasks + automations' },
  { id: 'concierge', label: 'Concierge', icon: Mail,      description: 'Email, bookings, admin' },
  { id: 'creation',  label: 'Creation',  icon: Mic2,      description: 'Voice and media ops' },
  { id: 'dev',       label: 'Dev',       icon: Code2,     description: 'Builder-backed execution' },
  { id: 'memory',    label: 'Memory',    icon: Database,  description: 'Grounded recall' },
  { id: 'finance',   label: 'Finance',   icon: Coins,     description: 'Real finance or unavailable' },
  { id: 'system',    label: 'System',    icon: Shield,    description: 'Runtime, approvals, receipts' },
]

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <aside
      className="flex h-full flex-col flex-shrink-0"
      style={{
        width: 220,
        borderRight: '1px solid rgba(0,212,255,0.10)',
        background: 'linear-gradient(180deg, rgba(4,16,26,0.97) 0%, rgba(3,10,18,0.95) 100%)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.22)',
      }}
    >
      {/* Wordmark */}
      <motion.div
        className="flex items-center gap-2 px-4 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 24, delay: 0.05 }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
          style={{ background: 'rgba(0,212,255,0.10)', border: '1px solid rgba(0,212,255,0.22)' }}
        >
          <Bot className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-mono tracking-[0.2em]" style={{ color: 'rgba(0,212,255,0.85)' }}>
            JARVIS
          </span>
          <span className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.55)' }}>
            local shell
          </span>
        </div>
        <kbd
          className="ml-auto rounded px-1.5 py-0.5 text-[8px] font-mono"
          style={{ color: 'rgba(192,232,240,0.25)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ⌘K
        </kbd>
      </motion.div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 px-2.5 py-3 flex-1 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon, description }, index) => {
          const isActive = activeTab === id
          return (
            <motion.button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left w-full"
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.7, delay: 0.15 + index * 0.06 }}
              style={{
                background: isActive ? 'rgba(0,212,255,0.10)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(0,212,255,0.24)' : 'transparent'}`,
                boxShadow: isActive ? '0 0 16px rgba(0,212,255,0.08)' : 'none',
              }}
              whileHover={{ background: isActive ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.04)', borderColor: isActive ? 'rgba(0,212,255,0.26)' : 'rgba(0,212,255,0.10)', x: 4 }}
              whileTap={{ scale: 0.96 }}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-active-rail"
                  className="absolute left-0 top-2.5 bottom-2.5 rounded-r-full"
                  style={{ width: 3, background: '#00d4ff', boxShadow: '0 0 8px rgba(0,212,255,0.8)' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}

              <div
                className="flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0"
                style={{
                  background: isActive ? 'rgba(0,212,255,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isActive ? 'rgba(0,212,255,0.26)' : 'rgba(192,232,240,0.07)'}`,
                  color: isActive ? '#00d4ff' : 'rgba(192,232,240,0.52)',
                }}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-[11px] font-mono tracking-[0.08em]"
                  style={{ color: isActive ? 'rgba(0,212,255,0.9)' : 'rgba(192,232,240,0.72)' }}
                >
                  {label}
                </p>
                <p
                  className="text-[9px] mt-0.5 truncate"
                  style={{ color: isActive ? 'rgba(0,212,255,0.45)' : 'rgba(192,232,240,0.32)' }}
                >
                  {description}
                </p>
              </div>
            </motion.button>
          )
        })}
      </nav>

      {/* Bottom status */}
      <motion.div
        className="px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(0,212,255,0.07)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.7 }}
      >
        <div className="flex items-center gap-1.5">
          <Command className="h-2.5 w-2.5" style={{ color: 'rgba(74,122,138,0.4)' }} />
          <span className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.4)' }}>
            JARVIS LOCAL v0.2
          </span>
        </div>
      </motion.div>
    </aside>
  )
}
