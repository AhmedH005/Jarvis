import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Zap, ChevronRight, Clock } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { cn } from '@/lib/utils'

export function RightPanel() {
  const config         = useJarvisStore((s) => s.config)
  const setConfig      = useJarvisStore((s) => s.setConfig)
  const isStreaming    = useJarvisStore((s) => s.isStreaming)
  const messages       = useJarvisStore((s) => s.messages)

  if (!config.layout.showRightPanel) return null

  const totalMessages  = messages.length
  const toolCallCount  = messages.flatMap((m) => m.toolCalls ?? []).length

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex flex-col border-l border-jarvis-border hud-panel"
      style={{ width: config.layout.rightPanelWidth, minWidth: 220 }}
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
            <StatRow label="Tool calls" value={String(toolCallCount)} />
            <StatRow
              label="State"
              value={isStreaming ? 'STREAMING' : 'IDLE'}
              valueColor={isStreaming ? '#00d4ff' : '#4a7a8a'}
            />
          </div>

          {/* Live activity bar */}
          <div className="px-3 pb-2">
            <div className="h-[2px] rounded-full bg-jarvis-border overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: '#00d4ff' }}
                animate={{ width: isStreaming ? '100%' : '0%' }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        </StatusSection>

        {/* Tool execution log */}
        <StatusSection icon={Zap} title="TOOL EXECUTION" color="#00ff88">
          <div className="px-3 py-1 space-y-1 max-h-40 overflow-y-auto">
            <AnimatePresence>
              {messages.flatMap((m) => m.toolCalls ?? []).slice(-6).reverse().map((tc) => (
                <motion.div
                  key={tc.id}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[10px] font-mono flex items-center gap-1.5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: tc.status === 'done' ? '#00ff88' :
                                  tc.status === 'error' ? '#ff6b35' : '#00d4ff',
                    }}
                  />
                  <span className="text-jarvis-muted truncate">{tc.name}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            {toolCallCount === 0 && (
              <p className="text-[10px] text-jarvis-muted opacity-50">No tool calls yet</p>
            )}
          </div>
        </StatusSection>

        {/* Session info */}
        <StatusSection icon={Clock} title="SESSION" color="#4a7a8a">
          <div className="px-3 py-2 space-y-2">
            <StatRow label="Started" value={new Date().toLocaleTimeString()} />
          </div>
        </StatusSection>
      </div>
    </motion.div>
  )
}

function StatusSection({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-jarvis-border/40">
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
