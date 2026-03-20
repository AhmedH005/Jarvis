import { motion } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'

/**
 * The JARVIS central HUD ring — a layered SVG animation that reacts to activity.
 * - Idle: slow, dim rotation
 * - Streaming: fast, bright pulse
 */
export function CentralRing() {
  const isStreaming = useJarvisStore((s) => s.isStreaming)
  const ocStatus    = useJarvisStore((s) => s.ocStatus)

  const color   = ocStatus.online ? '#00d4ff' : '#ff6b35'
  const speed   = isStreaming ? 2 : 8
  const opacity = isStreaming ? 0.9 : 0.4

  return (
    <div className="relative flex items-center justify-center w-48 h-48 mx-auto my-4">
      {/* Outer ring */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        animate={{ rotate: 360 }}
        transition={{ duration: speed, repeat: Infinity, ease: 'linear' }}
        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
      >
        <circle
          cx="96" cy="96" r="88"
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeDasharray="12 8"
          opacity={opacity}
        />
        <circle
          cx="96" cy="96" r="88"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="40 200"
          opacity={isStreaming ? 0.9 : 0.5}
        />
      </motion.svg>

      {/* Middle ring (counter-rotate) */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        animate={{ rotate: -360 }}
        transition={{ duration: speed * 1.5, repeat: Infinity, ease: 'linear' }}
      >
        <circle
          cx="96" cy="96" r="72"
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          strokeDasharray="6 18"
          opacity={opacity * 0.6}
        />
      </motion.svg>

      {/* Inner pulse circle */}
      <motion.div
        className="absolute w-24 h-24 rounded-full border"
        style={{ borderColor: `${color}44`, background: `${color}08` }}
        animate={isStreaming
          ? { scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }
          : { scale: [1, 1.04, 1], opacity: [0.3, 0.5, 0.3] }
        }
        transition={{ duration: isStreaming ? 0.8 : 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Core dot */}
      <motion.div
        className="w-3 h-3 rounded-full"
        style={{ background: color, boxShadow: `0 0 12px ${color}, 0 0 24px ${color}66` }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Waveform bars (show while streaming) */}
      {isStreaming && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-[3px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-[3px] rounded-sm"
              style={{ background: color, height: 16 }}
              animate={{ scaleY: [0.2, 1, 0.2] }}
              transition={{
                duration: 0.6 + Math.random() * 0.4,
                repeat: Infinity,
                delay: i * 0.07,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
