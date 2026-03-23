import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { playBootChime } from '@/lib/audio'
import { useJarvisStore } from '@/store/jarvis'

// Stark-extracted boot lines
const BOOT_LINES = [
  'Booting JARVIS systems...',
  'Loading neural interface...',
  'Connecting to OpenClaw gateway...',
  'System online.',
]

interface Props {
  onComplete: () => void
}

/**
 * BootOverlay — Stark-style intro sequence.
 *
 * Timing (exact from Stark Systems analysis):
 *   - 1000ms per boot line (sequential)
 *   - Progress bar fills 25% per line
 *   - After last line: 600ms → fade-out (1s transition)
 *   - After fade: onComplete()
 */
export function BootOverlay({ onComplete }: Props) {
  const [lines,    setLines]    = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [fading,   setFading]   = useState(false)
  const config = useJarvisStore((s) => s.config)
  const lineIdx = useRef(0)

  useEffect(() => {
    const step = () => {
      if (lineIdx.current >= BOOT_LINES.length) {
        // All lines shown — play chime, wait 600ms, then fade
        if (config.theme.soundEnabled) playBootChime()
        setTimeout(() => {
          setFading(true)
          // After 1s fade, call onComplete
          setTimeout(onComplete, 1000)
        }, 600)
        return
      }
      const current = lineIdx.current
      setLines((prev) => [...prev, BOOT_LINES[current]])
      setProgress(((current + 1) / BOOT_LINES.length) * 100)
      lineIdx.current++
      setTimeout(step, 1000) // Stark: 1000ms per line
    }
    const t = setTimeout(step, 300) // small initial delay
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(5,12,20,0.97)' }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: 1, ease: 'easeInOut' }}
    >
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,212,255,0.015) 2px, rgba(0,212,255,0.015) 4px)',
        }}
      />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-10 text-center"
      >
        <h1
          className="text-4xl font-mono font-light tracking-[0.5em] text-jarvis-primary"
          style={{ textShadow: '0 0 20px #00d4ff66' }}
        >
          JARVIS
        </h1>
        <p className="text-[10px] font-mono text-jarvis-muted tracking-[0.3em] mt-1">
          STARK SYSTEMS · AI INTERFACE
        </p>
        {/* Animated underline — Stark brandLine: 2s ease, 4.5s delay */}
        <motion.div
          className="h-px mt-2 mx-auto"
          style={{ background: 'linear-gradient(to right, transparent, #00d4ff, transparent)' }}
          initial={{ width: 0 }}
          animate={{ width: '80%' }}
          transition={{ duration: 2, delay: 0.5, ease: 'easeOut' }}
        />
      </motion.div>

      {/* Boot lines terminal */}
      <div className="w-[400px] font-mono text-[13px] space-y-1 mb-6">
        <AnimatePresence>
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              <span className="text-jarvis-primary opacity-60">›</span>
              <span
                className={i === lines.length - 1 && !fading ? 'boot-line' : 'boot-line done'}
                style={{ color: i === BOOT_LINES.length - 1 ? '#00ff88' : '#c8e6f0' }}
              >
                {line}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Progress bar — Stark: fills 25% per line, glow shadow */}
      <div className="w-[400px] h-[2px] bg-jarvis-border rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(to right, #00d4ff88, #00d4ff)',
            boxShadow:  '0 0 8px #00d4ff',
          }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <p className="text-[10px] font-mono text-jarvis-muted mt-2">
        {progress.toFixed(0)}%
      </p>
    </motion.div>
  )
}
