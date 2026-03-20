import { motion } from 'framer-motion'
import { Minus, Square, X, Cpu } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'

export function TitleBar() {
  const ocStatus = useJarvisStore((s) => s.ocStatus)

  const handleMinimize = () => window.jarvis?.window.minimize()
  const handleMaximize = () => window.jarvis?.window.maximize()
  const handleClose    = () => window.jarvis?.window.close()

  return (
    <div
      className="flex items-center justify-between h-10 px-4 border-b border-jarvis-border"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: logo + name */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <Cpu className="w-4 h-4 text-jarvis-primary" />
        </motion.div>
        <span className="text-xs font-mono font-medium tracking-[0.2em] text-jarvis-primary glow-text">
          JARVIS
        </span>
        <span className="text-xs font-mono text-jarvis-muted ml-1">v0.1</span>
      </div>

      {/* Center: status */}
      <div className="flex items-center gap-2">
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: ocStatus.online ? '#00ff88' : '#ff6b35' }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-[10px] font-mono text-jarvis-muted">
          {ocStatus.online
            ? `OPENCLAW ${ocStatus.model ? `· ${ocStatus.model}` : 'ONLINE'}`
            : 'OPENCLAW OFFLINE'}
        </span>
      </div>

      {/* Right: window controls */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {[
          { icon: Minus, action: handleMinimize, color: '#ffbd2e' },
          { icon: Square, action: handleMaximize, color: '#28c840' },
          { icon: X,     action: handleClose,    color: '#ff5f57' },
        ].map(({ icon: Icon, action, color }) => (
          <button
            key={color}
            onClick={action}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
          >
            <Icon className="w-3 h-3" style={{ color }} />
          </button>
        ))}
      </div>
    </div>
  )
}
