import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Zap, ChevronRight, Clock } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'

interface Props {
  engaged?: boolean
}

/**
 * RightPanel — Activity, Tool Execution, Session.
 *
 * Stark patterns applied:
 *   - `.bright` (brightness 1.4) when engaged — with 0.6s ease
 *   - Live clock (1s setInterval)
 *   - Energy bar random 72-99% (Stark: 2s interval)
 *   - System messages cycling
 */
export function RightPanel({ engaged = false }: Props) {
  const config      = useJarvisStore((s) => s.config)
  const setConfig   = useJarvisStore((s) => s.setConfig)
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const messages    = useJarvisStore((s) => s.messages)
  const sessionStart = useJarvisStore((s) => s.sessionStart)

  const [clock,  setClock]  = useState('')
  const [energy, setEnergy] = useState(85)
  const [msgIdx, setMsgIdx] = useState(0)

  const totalMessages = messages.length
  const toolCalls     = messages.flatMap((m) => m.toolCalls ?? [])
  const isStreaming   = streamPhase === 'streaming' || streamPhase === 'start'

  // Live clock — Stark: 1s interval
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Energy bar — Stark: random 72-99%, 2s interval
  useEffect(() => {
    const id = setInterval(
      () => setEnergy(72 + Math.floor(Math.random() * 27)),
      2000
    )
    return () => clearInterval(id)
  }, [])

  // System messages — Stark: 5s rotation
  const systemMsgs = [
    'All systems nominal',
    'Neural interface stable',
    'Gateway connection active',
    'Memory indexing online',
    'Pattern recognition active',
  ]
  useEffect(() => {
    const id = setInterval(
      () => setMsgIdx((i) => (i + 1) % systemMsgs.length),
      5000
    )
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Session duration
  const sessionAge = Math.floor((Date.now() - new Date(sessionStart).getTime()) / 1000)
  const sessionStr = sessionAge < 60
    ? `${sessionAge}s`
    : sessionAge < 3600
    ? `${Math.floor(sessionAge / 60)}m ${sessionAge % 60}s`
    : `${Math.floor(sessionAge / 3600)}h`

  if (!config.layout.showRightPanel) return null

  return (
    <div
      className="flex flex-col border-l border-jarvis-border hud-panel h-full"
      style={{
        width:      config.layout.rightPanelWidth,
        minWidth:   220,
        filter:     engaged ? 'brightness(1.2)' : 'brightness(1)',
        transition: 'filter 0.6s ease, border-color 0.6s ease, box-shadow 0.6s ease',
        ...(engaged ? {
          borderColor: 'rgba(0,212,255,0.27)',
          boxShadow:   '0 0 20px rgba(0,212,255,0.08)',
        } : {}),
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-jarvis-border">
        <span className="text-[10px] font-mono tracking-widest text-jarvis-muted">STATUS</span>
        <button
          onClick={() => setConfig({ layout: { ...config.layout, showRightPanel: false } })}
          className="text-jarvis-muted hover:text-jarvis-text transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-px">

        {/* Activity */}
        <StatusSection icon={Activity} title="ACTIVITY" color="#00d4ff">
          <div className="px-3 py-2 space-y-2">
            <StatRow label="Messages"  value={String(totalMessages)} />
            <StatRow label="Tool calls" value={String(toolCalls.length)} />
            <StatRow
              label="State"
              value={streamPhase.toUpperCase()}
              valueColor={phaseColor(streamPhase)}
            />
          </div>

          {/* Live activity progress — Stark: energy bar style */}
          <div className="px-3 pb-2">
            <div className="h-[2px] rounded-full bg-jarvis-border overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: isStreaming
                    ? 'linear-gradient(to right, #00d4ff88, #00d4ff)'
                    : '#00d4ff33',
                  boxShadow: isStreaming ? '0 0 6px #00d4ff' : 'none',
                }}
                animate={{ width: isStreaming ? '100%' : '0%' }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>

          {/* System message — Stark: cycles every 5s */}
          <motion.p
            key={msgIdx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="px-3 pb-2 text-[9px] font-mono text-jarvis-muted"
          >
            {systemMsgs[msgIdx]}
          </motion.p>
        </StatusSection>

        {/* Energy bar — Stark pattern: random 72-99% */}
        {config.widgets.systemStatus && (
          <StatusSection icon={Zap} title="ENERGY OUTPUT" color="#00ff88">
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono text-jarvis-muted">ARC REACTOR</span>
                <span className="text-[9px] font-mono text-jarvis-accent">{energy}%</span>
              </div>
              <div className="h-[3px] rounded-full bg-jarvis-border overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(to right, #00ff8866, #00ff88)',
                    boxShadow:  '0 0 6px #00ff88',
                  }}
                  animate={{ width: `${energy}%` }}
                  transition={{ duration: 0.8, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </StatusSection>
        )}

        {/* Tool execution log */}
        <StatusSection icon={Zap} title="TOOL EXECUTION" color="#00ff88">
          <div className="px-3 py-1 space-y-1 max-h-44 overflow-y-auto">
            <AnimatePresence>
              {toolCalls.slice(-8).reverse().map((tc) => (
                <motion.div
                  key={tc.id}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-[10px] font-mono flex items-center gap-1.5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: tc.status === 'done'    ? '#00ff88' :
                                  tc.status === 'error'   ? '#ff6b35' :
                                                            '#00d4ff',
                      boxShadow:  tc.status === 'running' ? '0 0 4px #00d4ff' : 'none',
                    }}
                  />
                  <span className="text-jarvis-muted truncate">{tc.name}</span>
                  <span className="ml-auto text-jarvis-muted opacity-50 text-[8px]">
                    {tc.status}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {toolCalls.length === 0 && (
              <p className="text-[10px] text-jarvis-muted opacity-40">No tool calls yet</p>
            )}
          </div>
        </StatusSection>

        {/* Session — with live clock */}
        <StatusSection icon={Clock} title="SESSION" color="#4a7a8a">
          <div className="px-3 py-2 space-y-2">
            {/* Live clock — Stark: HH:MM:SS */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-jarvis-muted">Clock</span>
              <span
                className="text-[11px] font-mono text-jarvis-primary"
                style={{ textShadow: '0 0 10px #00d4ff66' }}
              >
                {clock}
              </span>
            </div>
            <StatRow label="Uptime"    value={sessionStr} />
            <StatRow label="Messages"  value={String(totalMessages)} />
          </div>
        </StatusSection>

      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function phaseColor(phase: string): string {
  return {
    idle:      '#4a7a8a',
    start:     '#00d4ff',
    streaming: '#00d4ff',
    complete:  '#00ff88',
    error:     '#ff6b35',
  }[phase] ?? '#4a7a8a'
}

function StatusSection({
  icon: Icon, title, color, children,
}: {
  icon:     React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title:    string
  color:    string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-jarvis-border/30">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[9px] font-mono tracking-widest" style={{ color }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono text-jarvis-muted">{label}</span>
      <span className="text-[10px] font-mono" style={{ color: valueColor ?? '#c8e6f0' }}>{value}</span>
    </div>
  )
}
