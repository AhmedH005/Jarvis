import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Code2, MessageSquare } from 'lucide-react'
import { loadBuilderExecutionHistory, type BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import { EMPTY_RUN_HISTORY } from '@/adapters/run-history'
import { useJarvisStore } from '@/store/jarvis'
import { ReactorOrb } from '@/components/hud/ReactorOrb'
import { HudCornerPanel, PanelRow } from '@/components/hud/HudCornerPanel'
import { MessageList } from '@/components/chat/MessageList'
import { InputBar } from '@/components/chat/InputBar'
import { getReactorDisplayStatus } from '@/lib/reactor-display'
import { OptimizePreviewPanel } from '@/features/planner/OptimizePreviewPanel'
import { IntakePreviewPanel }   from '@/features/planner/IntakePreviewPanel'
import { TabNav } from './TabNav'
import { CommandPalette } from './CommandPalette'
import { AgentsTab } from './AgentsTab'
import { TasksTab } from './TasksTab'
import { NewCalendarTab } from './NewCalendarTab'
import { AutomationsTab } from './AutomationsTab'
import { DashboardTab } from './DashboardTab'
import { ConciergeTab } from './ConciergeTab'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { TabId } from '@/adapters/backend-files'

const CODING_SECTION = { id: 'coding', title: 'Coding Team', status: 'partial' as const, coreCapabilities: [], blockedCapabilities: [], recommendedUiContent: [], warningLabels: [] }

type CenterMode = 'chat' | 'code'

// Bouncy spring presets for futuristic entrance animations
const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 300, damping: 22, mass: 0.8 }
const SPRING_BOUNCY = { type: 'spring' as const, stiffness: 260, damping: 20, mass: 0.9 }
const SPRING_SOFT   = { type: 'spring' as const, stiffness: 180, damping: 18, mass: 1.0 }

export function TabShell() {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [centerMode, setCenterMode] = useState<CenterMode>('chat')

  function handleTabChange(id: TabId) {
    setActiveTab(id)
    if (id === 'coding') setCenterMode('code')
  }

  const showModeToggle = activeTab === 'chat'

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <CommandPalette />

      {/* Column 1: Tab navigation — springs in from left */}
      <motion.div
        initial={{ x: -120, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...SPRING_BOUNCY, delay: 0.1 }}
      >
        <TabNav activeTab={activeTab} onTabChange={handleTabChange} />
      </motion.div>

      {/* Column 2: Jarvis sidebar — scales up with bounce */}
      <motion.div
        className="flex-shrink-0"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.18 }}
      >
        <JarvisSidebar />
      </motion.div>

      {/* Column 3: Main content — springs in from right */}
      <motion.div
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...SPRING_BOUNCY, delay: 0.25 }}
      >
        {showModeToggle && (
          <motion.div
            className="flex items-center px-4 py-2.5 flex-shrink-0"
            style={{
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              background: 'linear-gradient(180deg, rgba(7,14,23,0.7), rgba(7,14,23,0.2))',
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.35 }}
          >
            <ModeToggle mode={centerMode} onSwitch={setCenterMode} />
          </motion.div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab === 'chat' ? `chat-${centerMode}` : activeTab}
              className="h-full"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              {activeTab === 'chat' && centerMode === 'chat' && <ChatView />}
              {activeTab === 'chat' && centerMode === 'code' && (
                <ErrorBoundary><CodingTeamLoader /></ErrorBoundary>
              )}
              {activeTab === 'tasks' && (
                <ErrorBoundary><TasksTab /></ErrorBoundary>
              )}
              {activeTab === 'calendar' && (
                <ErrorBoundary><NewCalendarTab /></ErrorBoundary>
              )}
              {activeTab === 'automations' && (
                <ErrorBoundary><AutomationsTab /></ErrorBoundary>
              )}
              {activeTab === 'dashboard' && (
                <ErrorBoundary><DashboardTab /></ErrorBoundary>
              )}
              {activeTab === 'concierge' && (
                <ErrorBoundary><ConciergeTab /></ErrorBoundary>
              )}
              {activeTab === 'coding' && (
                <ErrorBoundary><CodingTeamLoader /></ErrorBoundary>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

// ── Coding Team loader ──────────────────────────────────────────────────────────

function CodingTeamLoader() {
  const [history, setHistory] = useState<BuilderExecutionHistorySnapshot | null>(null)

  useEffect(() => {
    void loadBuilderExecutionHistory().then(setHistory)
    const id = setInterval(() => { void loadBuilderExecutionHistory().then(setHistory) }, 15_000)
    return () => clearInterval(id)
  }, [])

  if (!history) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.45)' }}>
          Loading coding team…
        </span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <AgentsTab
        section={CODING_SECTION}
        agents={[]}
        runHistory={EMPTY_RUN_HISTORY}
        builderExecutionHistory={history}
      />
    </div>
  )
}

// ── Chat view ───────────────────────────────────────────────────────────────────

function ChatView() {
  const plannerPreview = useJarvisStore((s) => s.plannerPreview)
  const setPlannerPreview = useJarvisStore((s) => s.setPlannerPreview)
  const setActivePlanSession = useJarvisStore((s) => s.setActivePlanSession)
  const intakePreview = useJarvisStore((s) => s.intakePreview)
  const setIntakePreview = useJarvisStore((s) => s.setIntakePreview)
  const optimizeType = plannerPreview?.result && 'weekStart' in plannerPreview.result ? 'week' : 'day'

  return (
    <div className="flex flex-col h-full">
      {plannerPreview?.result && (
        <div
          className="flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(157,78,221,0.12)', background: 'rgba(157,78,221,0.035)' }}
        >
          <OptimizePreviewPanel
            result={plannerPreview.result}
            optimizeType={optimizeType}
            onDismiss={() => {
              setPlannerPreview(null)
              setActivePlanSession(null)
            }}
          />
        </div>
      )}
      {intakePreview && (
        <div
          className="flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,255,136,0.02)' }}
        >
          <IntakePreviewPanel
            response={intakePreview}
            onDismiss={() => setIntakePreview(null)}
          />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageList />
      </div>
      <div className="flex-shrink-0">
        <InputBar />
      </div>
    </div>
  )
}

// ── Jarvis compact sidebar ──────────────────────────────────────────────────────

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
      {/* Reactor orb */}
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

      {/* HUD panels — staggered fade up */}
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

// ── Mode toggle ─────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onSwitch }: { mode: CenterMode; onSwitch: (m: CenterMode) => void }) {
  return (
    <div
      className="flex items-center rounded overflow-hidden"
      style={{ border: '1px solid rgba(0,212,255,0.16)', background: 'rgba(0,10,20,0.5)' }}
    >
      <ToggleButton
        active={mode === 'chat'}
        icon={<MessageSquare className="w-3 h-3" />}
        label="CHAT"
        onClick={() => onSwitch('chat')}
      />
      <ToggleButton
        active={mode === 'code'}
        icon={<Code2 className="w-3 h-3" />}
        label="CODE"
        onClick={() => onSwitch('code')}
      />
    </div>
  )
}

function ToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-3.5 py-1.5 transition-colors"
      style={{
        color: active ? '#00d4ff' : 'rgba(74,122,138,0.6)',
        background: active ? 'rgba(0,212,255,0.10)' : 'transparent',
      }}
    >
      {icon}
      <span className="text-[9px] font-mono tracking-[0.14em]">{label}</span>
    </button>
  )
}
