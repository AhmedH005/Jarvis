import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, Shield, Workflow } from 'lucide-react'
import { loadDemoSnapshot, refreshBackendFiles } from '@/adapters/backend-files'
import type { DemoSnapshot, TabId, TabMeta } from '@/adapters/backend-files'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import { TabNav } from './TabNav'
import { TruthBadge } from './TruthBadge'
import { JarvisHomeTab } from './JarvisHomeTab'
import { AgentsTab } from './AgentsTab'
import { MemoryTab } from './MemoryTab'
import { TimeTab } from './TimeTab'
import { WorkTab } from './WorkTab'
import { SystemTab } from './SystemTab'
import { ResearchTab } from './ResearchTab'
import { CalendarTab } from './CalendarTab'
import { FinancingTab } from './FinancingTab'
import { MiscTab } from './MiscTab'
import { CommandCenterTab } from './CommandCenterTab'
import { CommandPalette } from './CommandPalette'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function TabShell() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('jarvis')
  const [refreshing, setRefreshing] = useState(false)

  // ── Handoff navigation ─────────────────────────────────────────────────────
  const handoffNavTarget    = useMissionHandoffStore(s => s.navigationTarget)
  const clearHandoffNav     = useMissionHandoffStore(s => s.clearNavigation)

  useEffect(() => {
    if (handoffNavTarget === 'agents') {
      setActiveTab('agents')
      clearHandoffNav()
    }
  }, [handoffNavTarget, clearHandoffNav])

  useEffect(() => {
    void loadDemoSnapshot()
      .then((data) => {
        setSnapshot(data)
        if (data.tabs.length > 0) setActiveTab(data.tabs[0].id)
      })
      .catch((error: unknown) => {
        console.error('[JARVIS] loadDemoSnapshot failed unexpectedly:', error)
        setSnapshot({
          tabs: [],
          sections: {},
          agents: [],
          agentOperations: [],
          weeklySlots: [],
          candidateBlocks: [],
          workLedger: {
            rules: [],
            schoolGap: 'No data loaded.',
            businessGap: 'No data loaded.',
            items: [],
          },
          decisions: [],
          systemState: [],
          researchState: [],
          calendarState: [],
          memory: {
            stateLines: [],
            recentSummary: [],
            decisions: [],
            dailyMemoryExists: false,
            dailyMemoryPath: '',
          },
          runHistory: {
            runs: [],
            source: 'local-demo-fallback',
            sourceLabel: 'local demo',
            sourcePath: 'jarvis-local-demo/run-history.md',
            note: 'Run history could not be loaded.',
          },
          builderExecutionHistory: {
            scope: '/Users/ahmedh005/Jarvis',
            entries: [],
            source: 'local-demo-fallback',
            sourceLabel: 'shell-catch',
            status: 'blocked',
            note: 'Builder execution history could not be loaded.',
          },
          refreshedAt: new Date().toISOString(),
          errors: [error instanceof Error ? error.message : 'Shell snapshot failed to load'],
        })
      })
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await refreshBackendFiles()
      setSnapshot(data)
      if (!data.tabs.some((tab) => tab.id === activeTab) && data.tabs[0]) {
        setActiveTab(data.tabs[0].id)
      }
    } finally {
      setRefreshing(false)
    }
  }, [activeTab])

  const tabs = snapshot?.tabs ?? []
  const activeMeta = useMemo<TabMeta | undefined>(
    () => tabs.find((tab) => tab.id === activeTab),
    [tabs, activeTab]
  )
  const isJarvis = activeTab === 'jarvis'

  if (!snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div
          className="rounded-lg px-5 py-4"
          style={{
            background: 'rgba(0,212,255,0.035)',
            border: '1px solid rgba(0,212,255,0.12)',
          }}
        >
          <p className="text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(0,212,255,0.74)' }}>
            LOADING JARVIS SHELL
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-visible">
      <CommandPalette />
      <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex min-w-0 flex-1 flex-col overflow-visible">
        {isJarvis ? (
          <div className="flex min-h-0 flex-1 overflow-visible">
            <JarvisHomeTab />
          </div>
        ) : (
          <>
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 flex-shrink-0"
          style={{
            borderBottom: '1px solid rgba(0,212,255,0.08)',
            background: 'linear-gradient(180deg, rgba(7,14,23,0.8), rgba(7,14,23,0.28))',
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.92)' }}>
                {activeMeta?.label ?? 'Demo'}
              </p>
              {activeMeta && <TruthBadge label={activeMeta.truthLabel} />}
              {activeMeta?.sourceLayer === 'local-extension' && (
                <span
                  className="rounded px-1.5 py-0.5 text-[8px] font-mono tracking-[0.14em]"
                  style={{
                    color:      'rgba(255,200,74,0.72)',
                    background: 'rgba(255,200,74,0.07)',
                    border:     '1px solid rgba(255,200,74,0.14)',
                  }}
                >
                  LOCAL
                </span>
              )}
            </div>
            {activeMeta?.demoIntent && (
              <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.38)' }}>
                {activeMeta.demoIntent}
              </p>
            )}
            <p className="mt-0.5 text-[9px] font-mono" style={{ color: 'rgba(0,212,255,0.38)' }}>
              {activeMeta?.sourceLayer === 'local-extension'
                ? 'local extension'
                : activeMeta?.backendSource ?? '—'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {snapshot.errors.length > 0 && (
              <div className="flex items-center gap-1.5" style={{ color: '#ff6b35' }}>
                <AlertTriangle className="h-3 w-3" />
                <span className="text-[10px] font-mono">{snapshot.errors.length} read issue{snapshot.errors.length > 1 ? 's' : ''}</span>
              </div>
            )}
            <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
              refreshed {new Date(snapshot.refreshedAt).toLocaleTimeString()}
            </span>
            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-md px-3 py-2"
              style={{
                background: 'rgba(0,212,255,0.05)',
                border: '1px solid rgba(0,212,255,0.14)',
                color: refreshing ? 'rgba(0,212,255,0.35)' : 'rgba(0,212,255,0.72)',
                cursor: refreshing ? 'not-allowed' : 'pointer',
              }}
              whileHover={!refreshing ? { background: 'rgba(0,212,255,0.09)' } : {}}
              whileTap={!refreshing ? { scale: 0.97 } : {}}
            >
              <motion.div
                animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
                transition={refreshing ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
              >
                <RefreshCw className="h-3 w-3" />
              </motion.div>
              <span className="text-[10px] font-mono">{refreshing ? 'READING' : 'RELOAD'}</span>
            </motion.button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <ErrorBoundary>
                {activeTab === 'command' && (
                  <CommandCenterTab onNavigate={setActiveTab} />
                )}
                {activeTab === 'agents' && snapshot.sections.agents && (
                  <AgentsTab
                    section={snapshot.sections.agents}
                    agents={snapshot.agentOperations}
                    runHistory={snapshot.runHistory}
                    builderExecutionHistory={snapshot.builderExecutionHistory}
                  />
                )}
                {activeTab === 'memory' && snapshot.sections.memory && (
                  <MemoryTab section={snapshot.sections.memory} memory={snapshot.memory} />
                )}
                {activeTab === 'time' && snapshot.sections.time && (
                  <TimeTab
                    section={snapshot.sections.time}
                    weeklySlots={snapshot.weeklySlots}
                    candidateBlocks={snapshot.candidateBlocks}
                  />
                )}
                {activeTab === 'work' && snapshot.sections.work && (
                  <WorkTab section={snapshot.sections.work} workLedger={snapshot.workLedger} />
                )}
                {activeTab === 'system' && snapshot.sections.system && (
                  <SystemTab
                    section={snapshot.sections.system}
                    systemState={snapshot.systemState}
                    runHistory={snapshot.runHistory}
                    builderExecutionHistory={snapshot.builderExecutionHistory}
                  />
                )}
                {activeTab === 'research' && snapshot.sections.research && (
                  <ResearchTab section={snapshot.sections.research} researchState={snapshot.researchState} />
                )}
                {activeTab === 'calendar' && snapshot.sections.calendar && (
                  <CalendarTab section={snapshot.sections.calendar} calendarState={snapshot.calendarState} />
                )}
                {activeTab === 'financing' && snapshot.sections.financing && (
                  <FinancingTab section={snapshot.sections.financing} />
                )}
                {activeTab === 'misc' && snapshot.sections.misc && (
                  <MiscTab section={snapshot.sections.misc} />
                )}
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>

          <aside
            className="hidden xl:flex xl:w-[280px] xl:flex-col xl:gap-3 xl:px-4 xl:py-5 xl:flex-shrink-0"
            style={{
              borderLeft: '1px solid rgba(0,212,255,0.08)',
              background: 'rgba(4,10,18,0.45)',
            }}
          >
            <SummaryCard
              title="Truth Snapshot"
              icon={<Shield className="h-3.5 w-3.5" />}
              lines={[
                `${tabs.length} tabs from manifest`,
                `${tabs.filter((tab) => tab.sourceLayer === 'official-openclaw').length} official OpenClaw tabs`,
                `${tabs.filter((tab) => tab.sourceLayer === 'local-extension').length} local extension tabs`,
                `${snapshot.agentOperations.length} tracked worker roles`,
                `${snapshot.workLedger.items.length} real work items`,
              ]}
            />
            <SummaryCard
              title="Runtime Readiness"
              icon={<Workflow className="h-3.5 w-3.5" />}
              lines={[
                snapshot.sections.system?.status === 'live' ? 'System truth is live' : 'System truth unavailable',
                snapshot.sections.memory?.status === 'live' ? 'Memory truth is live' : 'Memory truth unavailable',
                snapshot.sections.research?.status === 'blocked' ? 'Research stays blocked honestly' : 'Research state changed',
                snapshot.sections.calendar?.status === 'future' ? 'Calendar stays future-facing' : 'Calendar state changed',
              ]}
            />
            {snapshot.errors.length > 0 && (
              <SummaryCard
                title="Read Issues"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                lines={snapshot.errors}
                tone="warn"
              />
            )}
          </aside>
        </div>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  icon,
  lines,
  tone = 'info',
}: {
  title: string
  icon: ReactNode
  lines: string[]
  tone?: 'info' | 'warn'
}) {
  const color = tone === 'warn' ? '#ff6b35' : '#00d4ff'

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{
        background: 'rgba(0,212,255,0.03)',
        border: `1px solid ${tone === 'warn' ? 'rgba(255,107,53,0.16)' : 'rgba(0,212,255,0.1)'}`,
      }}
    >
      <div className="mb-2 flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-[10px] font-mono tracking-[0.16em]">{title.toUpperCase()}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <p key={index} className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.55)' }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
