import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import { ReactorOrb } from '@/components/hud/ReactorOrb'
import { HudCornerPanel, PanelRow } from '@/components/hud/HudCornerPanel'
import { getReactorDisplayStatus } from '@/lib/reactor-display'
import { CommandPalette } from './CommandPalette'
import { TabNav } from './TabNav'
import { CommandTab } from './CommandTab'
import { TimeModuleTab } from './TimeModuleTab'
import { ConciergeOpsTab } from './ConciergeOpsTab'
import { CreationTab } from './CreationTab'
import { DevTab } from './DevTab'
import { MemoryOpsTab } from './MemoryOpsTab'
import { FinanceTab } from './FinanceTab'
import { SystemOpsTab } from './SystemOpsTab'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { TabId } from '@/adapters/backend-files'

const SPRING_BOUNCY = { type: 'spring' as const, stiffness: 260, damping: 20, mass: 0.9 }
const SPRING_SOFT = { type: 'spring' as const, stiffness: 180, damping: 18, mass: 1.0 }
const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 300, damping: 22, mass: 0.8 }

export function TabShell() {
  const [activeTab, setActiveTab] = useState<TabId>('command')

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <CommandPalette />

      <motion.div
        initial={{ x: -120, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...SPRING_BOUNCY, delay: 0.1 }}
      >
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      </motion.div>

      <motion.div
        className="flex-shrink-0"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.18 }}
      >
        <JarvisSidebar />
      </motion.div>

      <motion.div
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...SPRING_BOUNCY, delay: 0.25 }}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              className="h-full"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              {activeTab === 'command' && <ErrorBoundary><CommandTab /></ErrorBoundary>}
              {activeTab === 'time' && <ErrorBoundary><TimeModuleTab /></ErrorBoundary>}
              {activeTab === 'concierge' && <ErrorBoundary><ConciergeOpsTab /></ErrorBoundary>}
              {activeTab === 'creation' && <ErrorBoundary><CreationTab /></ErrorBoundary>}
              {activeTab === 'dev' && <ErrorBoundary><DevTab /></ErrorBoundary>}
              {activeTab === 'memory' && <ErrorBoundary><MemoryOpsTab /></ErrorBoundary>}
              {activeTab === 'finance' && <ErrorBoundary><FinanceTab /></ErrorBoundary>}
              {activeTab === 'system' && <ErrorBoundary><SystemOpsTab /></ErrorBoundary>}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

function JarvisSidebar() {
  const messages = useJarvisStore((s) => s.messages)
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const statusChecked = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const sessionStart = useJarvisStore((s) => s.sessionStart)
  const systemLogs = useJarvisStore((s) => s.systemLogs)

  const isEngaged = streamPhase === 'streaming' || streamPhase === 'start'
  const toolCalls = messages.flatMap((m) => m.toolCalls ?? [])
  const displayStatus = getReactorDisplayStatus({ reactorVisualLive, statusChecked, ocStatus })

  const [clock, setClock] = useState('')
  const [energy, setEnergy] = useState(84)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setEnergy(72 + Math.floor(Math.random() * 27)), 2000)
    return () => clearInterval(id)
  }, [])

  const sessionAge = Math.floor((Date.now() - new Date(sessionStart).getTime()) / 1000)
  const uptime = sessionAge < 60 ? `${sessionAge}s` : `${Math.floor(sessionAge / 60)}m ${sessionAge % 60}s`

  const phaseLabel = streamPhase === 'streaming' ? 'RESPONDING'
    : streamPhase === 'start' ? 'PROCESSING'
    : streamPhase === 'complete' ? 'COMPLETE'
    : streamPhase === 'error' ? 'ERROR'
    : 'STANDBY'

  const phaseColor = streamPhase === 'complete' ? '#00ff88'
    : streamPhase === 'error' ? '#ff6b35'
      : isEngaged ? '#00d4ff'
        : 'rgba(192,232,240,0.55)'

  return (
    <div
      className="flex h-full flex-col flex-shrink-0 overflow-y-auto overflow-x-hidden"
      style={{
        width: 200,
        borderLeft: '1px solid rgba(0,212,255,0.06)',
        borderRight: '1px solid rgba(0,212,255,0.08)',
        background: 'linear-gradient(180deg, rgba(4,14,24,0.95), rgba(4,10,18,0.9))',
      }}
    >
      <motion.div
        className="flex flex-col items-center pt-3 pb-1 flex-shrink-0"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16, mass: 0.9, delay: 0.3 }}
      >
        <ReactorOrb size={120} showLabel={false} />
        <motion.p
          className="mt-1 font-mono select-none"
          style={{ fontSize: '1rem', letterSpacing: '0.08em', color: '#00d4ff', textShadow: '0 0 10px rgba(0,212,255,0.3)', fontWeight: 300 }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {clock}
        </motion.p>
        <p className="text-[9px] font-mono tracking-[0.16em] mt-0.5" style={{ color: phaseColor }}>
          {phaseLabel}
        </p>
      </motion.div>

      <motion.div
        className="px-2 pb-3 space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_SNAPPY, delay: 0.5 }}
      >
        <HudCornerPanel title="STATUS" engaged={isEngaged} className="!p-0">
          <PanelRow label="Core" value={displayStatus.coreValue} valueColor={displayStatus.color} highlight />
          <PanelRow label="Uptime" value={uptime} />
          <PanelRow label="Messages" value={String(messages.length)} />
          <PanelRow label="Tools" value={String(toolCalls.length)} />
        </HudCornerPanel>

        <HudCornerPanel title="ENERGY" engaged={isEngaged} className="!p-0">
          <PanelRow label="Arc Reactor" value={`${energy}%`} valueColor="#00d4ff" highlight />
          <div className="my-1 rounded-full overflow-hidden" style={{ height: 2, background: 'rgba(0,212,255,0.1)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(to right, rgba(0,212,255,0.5), #00d4ff)', boxShadow: '0 0 4px rgba(0,212,255,0.5)' }}
              animate={{ width: `${energy}%` }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
            />
          </div>
          <PanelRow label="Phase" value={streamPhase.toUpperCase()} valueColor={phaseColor} />
        </HudCornerPanel>

        <HudCornerPanel title="CONNECTION" engaged={isEngaged} className="!p-0">
          <PanelRow label="Status" value={displayStatus.connectionValue} valueColor={displayStatus.color} highlight />
          <PanelRow label="Gateway" value={displayStatus.gatewayHint} />
          <PanelRow label="Model" value={ocStatus.model ? ocStatus.model.slice(0, 14) : '—'} />
        </HudCornerPanel>

        <HudCornerPanel title="LOG" engaged={false} className="!p-0">
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {systemLogs.length === 0 ? (
              <p className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.2)' }}>—</p>
            ) : (
              systemLogs.slice(-8).map((line, i) => (
                <p
                  key={i}
                  className="text-[8px] font-mono leading-tight truncate"
                  style={{
                    color: line.includes('✗') ? '#ff6b35'
                      : line.includes('✓') ? '#00ff88'
                        : 'rgba(192,232,240,0.4)',
                  }}
                >
                  {line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')}
                </p>
              ))
            )}
          </div>
        </HudCornerPanel>
      </motion.div>
    </div>
  )
}
