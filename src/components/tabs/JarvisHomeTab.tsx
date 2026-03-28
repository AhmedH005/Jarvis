import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import { ReactorOrb } from '@/components/hud/ReactorOrb'
import { HudCornerPanel, PanelRow } from '@/components/hud/HudCornerPanel'
import { InputBar } from '@/components/chat/InputBar'
import { MessageList } from '@/components/chat/MessageList'
import { getReactorDisplayStatus } from '@/lib/reactor-display'
import { OptimizePreviewPanel } from '@/features/planner/OptimizePreviewPanel'
import { IntakePreviewPanel }   from '@/features/planner/IntakePreviewPanel'

export function JarvisHomeTab() {
  const config = useJarvisStore((s) => s.config)
  const messages = useJarvisStore((s) => s.messages)
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const statusChecked = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const pushLog = useJarvisStore((s) => s.pushLog)
  const sessionStart = useJarvisStore((s) => s.sessionStart)
  const setStreamPhase = useJarvisStore((s) => s.setStreamPhase)
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const plannerPreview = useJarvisStore((s) => s.plannerPreview)
  const setPlannerPreview = useJarvisStore((s) => s.setPlannerPreview)
  const setActivePlanSession = useJarvisStore((s) => s.setActivePlanSession)
  const intakePreview = useJarvisStore((s) => s.intakePreview)
  const setIntakePreview = useJarvisStore((s) => s.setIntakePreview)

  const [clock, setClock] = useState('')
  const [energy, setEnergy] = useState(84)
  const [msgIdx, setMsgIdx] = useState(0)

  const isEngaged = streamPhase === 'streaming' || streamPhase === 'start'
  const toolCalls = messages.flatMap((m) => m.toolCalls ?? [])

  useEffect(() => {
    if (streamPhase !== 'complete' && streamPhase !== 'error') return
    const t = setTimeout(() => setStreamPhase('idle'), 2500)
    return () => clearTimeout(t)
  }, [setStreamPhase, streamPhase, config.theme.soundEnabled])

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

  const systemMsgs = [
    'Neural interface stable',
    'Arc reactor nominal',
    'Gateway connection active',
    'Memory index online',
    'Pattern recognition active',
    'Satellite uplink established',
  ]

  useEffect(() => {
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % systemMsgs.length), 5000)
    return () => clearInterval(id)
  }, [systemMsgs.length])

  useEffect(() => {
    if (!statusChecked) return
    pushLog(`Dashboard ready · ${ocStatus.online ? 'gateway online' : 'gateway offline'}`, ocStatus.online ? 'success' : 'warn')
  }, [ocStatus.online, pushLog, statusChecked])

  const sessionAge = Math.floor((Date.now() - new Date(sessionStart).getTime()) / 1000)
  const uptime = sessionAge < 60 ? `${sessionAge}s` : `${Math.floor(sessionAge / 60)}m ${sessionAge % 60}s`

  const centerText =
    streamPhase === 'start' ? 'PROCESSING...'
    : streamPhase === 'streaming' ? 'RESPONDING...'
    : streamPhase === 'complete' ? 'COMPLETE'
    : streamPhase === 'error' ? 'ERROR'
    : messages.length > 0 ? 'STANDING BY'
    : 'AWAITING YOUR COMMAND, SIR.'

  const centerColor =
    streamPhase === 'complete' ? '#00ff88'
    : streamPhase === 'error' ? '#ff6b35'
    : isEngaged ? '#00d4ff'
    : 'rgba(192,232,240,0.55)'

  const displayStatus = getReactorDisplayStatus({ reactorVisualLive, statusChecked, ocStatus })
  const gatewayColor = displayStatus.color
  const gatewayCoreValue = displayStatus.coreValue
  const gatewayConnectionValue = displayStatus.connectionValue
  const optimizeType = plannerPreview?.result && 'weekStart' in plannerPreview.result ? 'week' : 'day'

  return (
    <div className="flex flex-1 min-h-0 overflow-visible gap-3 px-3 py-3">
      <motion.div
        className="flex flex-col gap-3 flex-shrink-0"
        style={{ width: 196 }}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
      >
        <HudCornerPanel title="SYSTEM STATUS" engaged={isEngaged}>
          <PanelRow
            label="Core"
            value={gatewayCoreValue}
            valueColor={gatewayColor}
            highlight
          />
          <PanelRow label="Uptime" value={uptime} />
          <PanelRow label="Messages" value={String(messages.length)} />
          <PanelRow label="Integrity" value="Nominal" valueColor="#00ff88" />
        </HudCornerPanel>

        <HudCornerPanel title="ENERGY OUTPUT" engaged={isEngaged}>
          <PanelRow label="Arc Reactor" value={`${energy}%`} valueColor="#00d4ff" highlight />
          <div
            className="my-1.5 rounded-full overflow-hidden"
            style={{ height: 3, background: 'rgba(0,212,255,0.1)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(to right, rgba(0,212,255,0.5), #00d4ff)',
                boxShadow: '0 0 5px rgba(0,212,255,0.6)',
              }}
              animate={{ width: `${energy}%` }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
            />
          </div>
          <PanelRow label="Tools used" value={String(toolCalls.length)} />
          <PanelRow label="Phase" value={streamPhase.toUpperCase()} valueColor={centerColor} />
        </HudCornerPanel>

        <HudCornerPanel title="SYSTEM LOG" engaged={false}>
          <SystemLogLines />
        </HudCornerPanel>
      </motion.div>

      <div className="flex-1 flex flex-col items-center min-h-0 overflow-visible">
        <div className="flex flex-col items-center flex-shrink-0 pt-1" style={{ overflow: 'visible' }}>
          <ReactorOrb size={260} />

          <motion.p
            key={centerText}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-[11px] font-mono tracking-[0.22em]"
            style={{
              color: centerColor,
              textShadow: isEngaged ? '0 0 10px rgba(0,212,255,0.5)' : 'none',
              transition: 'color 0.6s ease',
            }}
          >
            {centerText}
          </motion.p>

          <motion.p
            className="mt-1 font-mono select-none"
            style={{
              fontSize: '1.85rem',
              letterSpacing: '0.1em',
              color: '#00d4ff',
              textShadow: '0 0 14px rgba(0,212,255,0.4)',
              fontWeight: 300,
            }}
            animate={{ opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {clock}
          </motion.p>

          <AnimatePresence mode="wait">
            <motion.p
              key={msgIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-0.5 text-[10px] font-mono select-none"
              style={{ color: 'rgba(192,232,240,0.4)', letterSpacing: '0.07em' }}
            >
              {'› '}{systemMsgs[msgIdx]}
            </motion.p>
          </AnimatePresence>
        </div>

        <div
          className="my-2 flex-shrink-0"
          style={{
            width: '90%',
            height: 1,
            background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.18), transparent)',
          }}
        />

        {plannerPreview?.result && (
          <div className="w-full flex-shrink-0 mb-2" style={{ border: '1px solid rgba(157,78,221,0.12)', background: 'rgba(157,78,221,0.035)' }}>
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
          <div className="w-full flex-shrink-0 mb-2" style={{ border: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,255,136,0.02)' }}>
            <IntakePreviewPanel
              response={intakePreview}
              onDismiss={() => setIntakePreview(null)}
            />
          </div>
        )}

        <div className="flex-1 w-full min-h-0 overflow-hidden">
          <MessageList />
        </div>

        <div className="w-full flex-shrink-0">
          <InputBar />
        </div>
      </div>

      <motion.div
        className="flex flex-col gap-3 flex-shrink-0"
        style={{ width: 196 }}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
      >
        <HudCornerPanel title="CONNECTION" engaged={isEngaged}>
          <PanelRow
            label="Status"
            value={gatewayConnectionValue}
            valueColor={gatewayColor}
            highlight
          />
          <PanelRow label="Gateway" value={displayStatus.gatewayHint} />
          <PanelRow label="Model" value={ocStatus.model ? ocStatus.model.slice(0, 16) : '—'} />
          <PanelRow label="Encrypt" value="Active" valueColor="#00ff88" />
        </HudCornerPanel>

        <HudCornerPanel title="CONVERSATION" engaged={isEngaged}>
          {messages.filter((m) => !(m.role === 'assistant' && m.streaming && m.content.trim().length === 0)).length === 0 ? (
            <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.3)' }}>
              No messages yet
            </p>
          ) : (
            <div className="space-y-1.5">
              {messages
                .filter((m) => !(m.role === 'assistant' && m.streaming && m.content.trim().length === 0))
                .slice(-5)
                .map((m) => (
                  <div key={m.id} className="flex gap-1.5 items-start">
                    <span
                      className="text-[9px] font-mono flex-shrink-0 mt-0.5"
                      style={{ color: m.role === 'user' ? '#00d4ff' : 'rgba(192,232,240,0.38)' }}
                    >
                      {m.role === 'user' ? '›' : '‹'}
                    </span>
                    <p
                      className="text-[9px] font-mono leading-snug"
                      style={{
                        color: m.role === 'user' ? 'rgba(0,212,255,0.75)' : 'rgba(192,232,240,0.6)',
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      } as CSSProperties}
                    >
                      {m.content.slice(0, 60)}{m.content.length > 60 ? '…' : ''}
                    </p>
                  </div>
                ))}
              {isEngaged && (
                <div className="flex gap-1.5 items-center mt-0.5">
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.38)' }}>‹</span>
                  <ThinkingDots />
                </div>
              )}
            </div>
          )}
        </HudCornerPanel>

        <HudCornerPanel title="SESSION" engaged={false}>
          <PanelRow label="Duration" value={uptime} />
          <PanelRow label="Turns" value={String(messages.filter((m) => m.role === 'user').length)} />
          <PanelRow label="Region" value="Local" />
          <PanelRow label="Auth" value="Bearer" valueColor="#00ff88" />
        </HudCornerPanel>
      </motion.div>
    </div>
  )
}

function SystemLogLines() {
  const systemLogs = useJarvisStore((s) => s.systemLogs)
  const last = systemLogs.slice(-6)
  if (last.length === 0) {
    return <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.22)' }}>—</p>
  }

  return (
    <div className="space-y-0.5">
      {last.map((line, index) => (
        <p
          key={index}
          className="text-[9px] font-mono leading-tight truncate"
          style={{
            color: line.includes('✗')
              ? '#ff6b35'
              : line.includes('✓')
                ? '#00ff88'
                : 'rgba(192,232,240,0.45)',
          }}
        >
          {line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')}
        </p>
      ))}
    </div>
  )
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5 items-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="text-[10px] font-mono"
          style={{ color: 'rgba(0,212,255,0.65)' }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
        >
          ·
        </motion.span>
      ))}
    </span>
  )
}
