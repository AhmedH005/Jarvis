import type { FC } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  Bot,
  Brain,
  Briefcase,
  CalendarDays,
  Clock,
  Command,
  Landmark,
  Sparkles,
  Search,
  Terminal,
  Users,
} from 'lucide-react'
import type { TabId, TabMeta, TruthLabel } from '@/adapters/backend-files'

// One-line role descriptor for the three primary tabs.
// These clarify each surface's job without relying on backend demoIntent copy.
const PRIMARY_TAB_ROLE: Partial<Record<TabId, string>> = {
  command: 'Create & route new work',
  agents:  'Process handed-off work',
  system:  'Inspect runs & activity',
}

interface TabNavProps {
  tabs: TabMeta[]
  activeTab: TabId
  onTabChange: (id: TabId) => void
}

const ICONS: Record<TabId, FC<{ className?: string }>> = {
  jarvis:   Bot,
  command:  Terminal,
  agents:   Users,
  memory:   Brain,
  time:     Clock,
  work:     Briefcase,
  system:   Activity,
  research: Search,
  calendar: CalendarDays,
  financing: Landmark,
  misc:     Sparkles,
}

const TRUTH_COLOR: Record<TruthLabel, string> = {
  live: '#00ff88',
  partial: '#ffc84a',
  blocked: '#ff6b35',
  future: 'rgba(192,232,240,0.42)',
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <aside
      className="flex h-full flex-col gap-2 px-3 py-4 flex-shrink-0"
      style={{
        width: 228,
        borderRight: '1px solid rgba(0,212,255,0.12)',
        background: 'linear-gradient(180deg, rgba(4,18,28,0.92), rgba(4,10,18,0.88))',
        boxShadow: '12px 0 40px rgba(0,0,0,0.18)',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 rounded px-3 py-2.5"
        style={{
          background: 'rgba(0,212,255,0.03)',
          border: '1px solid rgba(0,212,255,0.10)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Command className="h-3 w-3 flex-shrink-0" style={{ color: 'rgba(0,212,255,0.50)' }} />
          <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.60)' }}>
            JARVIS
          </span>
        </div>
        <kbd
          className="rounded px-1.5 py-0.5 text-[8px] font-mono"
          style={{
            color:      'rgba(192,232,240,0.30)',
            background: 'rgba(255,255,255,0.05)',
            border:     '1px solid rgba(255,255,255,0.09)',
          }}
        >
          ⌘K
        </kbd>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.id]
          const isActive = activeTab === tab.id

          return (
            <motion.button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex items-start gap-3 rounded-lg px-3 py-3 text-left"
              style={{
                background: isActive ? 'rgba(0,212,255,0.11)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${isActive ? 'rgba(0,212,255,0.28)' : 'rgba(0,212,255,0.08)'}`,
                boxShadow: isActive ? '0 0 20px rgba(0,212,255,0.1), inset 0 0 18px rgba(0,212,255,0.03)' : 'none',
              }}
              whileHover={{
                background: isActive ? 'rgba(0,212,255,0.13)' : 'rgba(0,212,255,0.05)',
                borderColor: isActive ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.16)',
              }}
              whileTap={{ scale: 0.98 }}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-active-rail"
                  className="absolute left-0 top-3 bottom-3 rounded-r-full"
                  style={{
                    width: 3,
                    background: '#00d4ff',
                    boxShadow: '0 0 10px rgba(0,212,255,0.85)',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                />
              )}

              <div
                className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-md flex-shrink-0"
                style={{
                  background: isActive ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(0,212,255,0.22)' : 'rgba(192,232,240,0.08)'}`,
                  color: isActive ? '#00d4ff' : 'rgba(192,232,240,0.6)',
                }}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-mono tracking-[0.14em]"
                    style={{ color: isActive ? 'rgba(0,212,255,0.9)' : 'rgba(192,232,240,0.7)' }}
                  >
                    {tab.label.toUpperCase()}
                  </span>
                  {tab.sourceLayer === 'local-extension' && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[8px] font-mono tracking-[0.18em]"
                      style={{
                        color: '#ffc84a',
                        background: 'rgba(255,200,74,0.08)',
                        border: '1px solid rgba(255,200,74,0.16)',
                      }}
                    >
                      LOCAL
                    </span>
                  )}
                  <span
                    className="inline-block rounded-full flex-shrink-0"
                    style={{
                      width: 6,
                      height: 6,
                      background: TRUTH_COLOR[tab.truthLabel],
                      boxShadow: `0 0 10px ${TRUTH_COLOR[tab.truthLabel]}`,
                    }}
                  />
                </div>
                {PRIMARY_TAB_ROLE[tab.id] ? (
                  <p className="mt-0.5 text-[10px] leading-snug font-medium" style={{ color: isActive ? 'rgba(0,212,255,0.55)' : 'rgba(192,232,240,0.48)' }}>
                    {PRIMARY_TAB_ROLE[tab.id]}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.38)' }}>
                    {tab.demoIntent}
                  </p>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>
    </aside>
  )
}
