import { motion } from 'framer-motion'
import { Brain, CheckSquare, ScrollText, ChevronLeft } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { cn } from '@/lib/utils'

export function LeftPanel() {
  const config    = useJarvisStore((s) => s.config)
  const setConfig = useJarvisStore((s) => s.setConfig)
  const messages  = useJarvisStore((s) => s.messages)
  const logs      = useJarvisStore((s) => s.systemLogs)

  if (!config.layout.showLeftPanel) return null

  // Derive recent memories from conversation (placeholder until real memory API)
  const recentTopics = messages
    .filter((m) => m.role === 'user')
    .slice(-4)
    .reverse()
    .map((m) => m.content.slice(0, 40))

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex flex-col border-r border-jarvis-border hud-panel"
      style={{ width: config.layout.leftPanelWidth, minWidth: 220 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-jarvis-border">
        <span className="text-[10px] font-mono tracking-widest text-jarvis-muted">MODULES</span>
        <button
          onClick={() => setConfig({ layout: { ...config.layout, showLeftPanel: false } })}
          className="text-jarvis-muted hover:text-jarvis-text transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-px py-2">
        {/* Memory Surface */}
        {config.widgets.memory && (
          <PanelSection icon={Brain} title="MEMORY" color="#00d4ff">
            {recentTopics.length === 0 ? (
              <p className="text-[10px] text-jarvis-muted font-mono px-3 py-2">No recent context</p>
            ) : (
              <ul className="px-3 py-1 space-y-1">
                {recentTopics.map((t, i) => (
                  <li key={i} className="text-[10px] font-mono text-jarvis-muted truncate">
                    <span className="text-jarvis-primary mr-1.5">›</span>{t}
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>
        )}

        {/* Tasks placeholder */}
        {config.widgets.tasks && (
          <PanelSection icon={CheckSquare} title="TASKS" color="#00ff88">
            <p className="text-[10px] text-jarvis-muted font-mono px-3 py-2">
              OpenClaw task integration
              <br />
              <span className="opacity-50">coming in v0.2</span>
            </p>
          </PanelSection>
        )}

        {/* System log */}
        {config.widgets.logs && (
          <PanelSection icon={ScrollText} title="SYSTEM LOG" color="#ff6b35">
            <div className="px-3 py-1 space-y-0.5 max-h-32 overflow-y-auto">
              {logs.slice(-10).reverse().map((line, i) => (
                <p key={i} className="text-[9px] font-mono text-jarvis-muted leading-relaxed">{line}</p>
              ))}
            </div>
          </PanelSection>
        )}
      </div>
    </motion.div>
  )
}

function PanelSection({
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
