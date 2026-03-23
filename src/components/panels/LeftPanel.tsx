import { motion } from 'framer-motion'
import { Brain, CheckSquare, ScrollText, ChevronLeft } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'

interface Props {
  engaged?: boolean
}

/**
 * LeftPanel — Memory, Tasks, System Log.
 *
 * Stark patterns applied:
 *   - `.bright` filter (brightness 1.4) when engaged (streaming)
 *   - `--transition-speed: 0.6s ease` on filter changes
 *   - System log styled as a console with colored prefixes
 */
export function LeftPanel({ engaged = false }: Props) {
  const config    = useJarvisStore((s) => s.config)
  const setConfig = useJarvisStore((s) => s.setConfig)
  const messages  = useJarvisStore((s) => s.messages)
  const logs      = useJarvisStore((s) => s.systemLogs)

  if (!config.layout.showLeftPanel) return null

  const recentTopics = messages
    .filter((m) => m.role === 'user')
    .slice(-5)
    .reverse()
    .map((m) => m.content.slice(0, 42))

  return (
    <div
      className="flex flex-col border-r border-jarvis-border hud-panel h-full"
      style={{
        width:    config.layout.leftPanelWidth,
        minWidth: 220,
        filter:   engaged ? 'brightness(1.2)' : 'brightness(1)',
        transition: 'filter 0.6s ease, border-color 0.6s ease, box-shadow 0.6s ease',
        ...(engaged ? {
          borderColor: 'rgba(0,212,255,0.27)',
          boxShadow:   '0 0 20px rgba(0,212,255,0.08)',
        } : {}),
      }}
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
        {/* Memory */}
        {config.widgets.memory && (
          <PanelSection icon={Brain} title="MEMORY" color="#00d4ff">
            {recentTopics.length === 0 ? (
              <p className="text-[10px] text-jarvis-muted font-mono px-3 py-2 opacity-60">
                No recent context
              </p>
            ) : (
              <ul className="px-3 py-1 space-y-1">
                {recentTopics.map((t, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="text-[10px] font-mono text-jarvis-muted truncate"
                  >
                    <span className="text-jarvis-primary mr-1.5">›</span>{t}
                  </motion.li>
                ))}
              </ul>
            )}
          </PanelSection>
        )}

        {/* Tasks placeholder */}
        {config.widgets.tasks && (
          <PanelSection icon={CheckSquare} title="TASKS" color="#00ff88">
            <p className="text-[10px] text-jarvis-muted font-mono px-3 py-2">
              OpenClaw integration
              <br />
              <span className="opacity-40">v0.2</span>
            </p>
          </PanelSection>
        )}

        {/* System Log — console style */}
        {config.widgets.logs && (
          <PanelSection icon={ScrollText} title="SYSTEM LOG" color="#ff6b35">
            <div className="px-2 py-1 space-y-px max-h-48 overflow-y-auto font-mono text-[9px]">
              {logs.length === 0 && (
                <p className="text-jarvis-muted opacity-40 px-1">Awaiting events…</p>
              )}
              {logs.slice(-20).reverse().map((line, i) => (
                <p
                  key={i}
                  className="leading-relaxed truncate"
                  style={{ color: logColor(line) }}
                >
                  {line}
                </p>
              ))}
            </div>
          </PanelSection>
        )}
      </div>
    </div>
  )
}

/** Color code log lines by their prefix symbol */
function logColor(line: string): string {
  if (line.includes('] ✓')) return '#00ff88'
  if (line.includes('] ✗')) return '#ff6b35'
  if (line.includes('] ⚠')) return '#ffbd2e'
  if (line.includes('] ⚡')) return '#00d4ff'
  return '#4a7a8a'
}

function PanelSection({
  icon: Icon,
  title,
  color,
  children,
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
