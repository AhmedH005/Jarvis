import { motion } from 'framer-motion'
import { Minus, Square, X, Cpu } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { getReactorDisplayStatus } from '@/lib/reactor-display'

export function TitleBar() {
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const statusChecked = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)

  const handleMinimize = () => window.jarvis?.window.minimize()
  const handleMaximize = () => window.jarvis?.window.maximize()
  const handleClose    = () => window.jarvis?.window.close()

  const displayStatus = getReactorDisplayStatus({ reactorVisualLive, statusChecked, ocStatus })

  return (
    <div
      className="flex items-center justify-between h-10 px-4 border-b border-jarvis-border"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: logo + name */}
      <motion.div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
      >
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
      </motion.div>

      {/* Center: status */}
      <motion.div
        className="flex items-center gap-2"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.2 }}
      >
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: displayStatus.color }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-[10px] font-mono text-jarvis-muted">
          {displayStatus.titleText}
        </span>
      </motion.div>

      {/* Right: window controls */}
      <motion.div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.15 }}
      >
        {[
          { icon: Minus, action: handleMinimize, color: '#ffbd2e' },
          { icon: Square, action: handleMaximize, color: '#28c840' },
          { icon: X,     action: handleClose,    color: '#ff5f57' },
        ].map(({ icon: Icon, action, color }) => (
          <motion.button
            key={color}
            onClick={action}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
          >
            <Icon className="w-3 h-3" style={{ color }} />
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
