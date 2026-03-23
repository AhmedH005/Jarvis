import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import type { StreamPhase } from '@/types'

/**
 * CentralRing — JARVIS arc reactor.
 *
 * Animation states mapped from Stark Systems:
 *
 *   idle      → rotation 8s, pulse 2s, dim glow, opacity 0.4
 *   start     → 0.6s ease transition into engaged, brightness 1.2
 *   streaming → rotation 2s, pulse 1s, bright glow, brightness 1.4
 *   complete  → brief brightness flash (1.4 → 1.0 over 1s), accent color flash
 *   error     → warm color switch, pulse 0.5s (Stark breach timing)
 */

interface PhaseStyle {
  color:        string
  glowColor:    string
  rotationSpeed: number   // outer ring rotation duration (s)
  pulseClass:   string    // stark-pulse variant
  opacity:      number
  brightness:   number
  coreScale:    number[]  // [min, max]
  coreDuration: number
}

const PHASE_STYLES: Record<StreamPhase, PhaseStyle> = {
  idle: {
    color:         '#00d4ff',
    glowColor:     '#00d4ff66',
    rotationSpeed: 8,
    pulseClass:    'pulse-idle',
    opacity:       0.4,
    brightness:    1.0,
    coreScale:     [1, 1.15],
    coreDuration:  2.0,
  },
  start: {
    color:         '#00d4ff',
    glowColor:     '#00d4ffaa',
    rotationSpeed: 3,
    pulseClass:    'pulse-engaged',
    opacity:       0.7,
    brightness:    1.2,
    coreScale:     [1, 1.25],
    coreDuration:  1.0,
  },
  streaming: {
    color:         '#00d4ff',
    glowColor:     '#00d4ffcc',
    rotationSpeed: 2,
    pulseClass:    'pulse-engaged',
    opacity:       0.9,
    brightness:    1.4,    // Stark .bright
    coreScale:     [1, 1.3],
    coreDuration:  1.0,
  },
  complete: {
    color:         '#00ff88',
    glowColor:     '#00ff88aa',
    rotationSpeed: 4,
    pulseClass:    'pulse-engaged',
    opacity:       0.8,
    brightness:    1.3,
    coreScale:     [1, 1.2],
    coreDuration:  1.0,
  },
  error: {
    color:         '#ff6b35',
    glowColor:     '#ff6b3588',
    rotationSpeed: 1,           // Stark breach: very fast
    pulseClass:    'pulse-breach',
    opacity:       0.9,
    brightness:    1.1,
    coreScale:     [1, 1.4],
    coreDuration:  0.5,          // Stark breach: 0.5s
  },
}

export function CentralRing() {
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const ocStatus    = useJarvisStore((s) => s.ocStatus)
  const tokenCount  = useJarvisStore((s) => s.tokenCount)

  const phase = !ocStatus.online ? 'error' : streamPhase
  const s     = PHASE_STYLES[phase]

  // Waveform bar heights — randomize once per component (stable)
  const barDelays = useMemo(() => Array.from({ length: 11 }, (_, i) => i * 0.06), [])

  const isActive    = phase === 'streaming' || phase === 'start'
  const showWave    = phase === 'streaming'
  const filterStyle = `drop-shadow(0 0 ${isActive ? '16' : '6'}px ${s.glowColor})`

  return (
    <div className="relative flex flex-col items-center justify-center py-2">
      {/* Phase label */}
      <motion.p
        className="text-[9px] font-mono tracking-[0.3em] mb-1"
        style={{ color: s.color, opacity: 0.7 }}
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {phase === 'idle'      && 'STANDBY'}
        {phase === 'start'     && 'PROCESSING'}
        {phase === 'streaming' && 'RESPONDING'}
        {phase === 'complete'  && 'COMPLETE'}
        {phase === 'error'     && 'OFFLINE'}
      </motion.p>

      <div className="relative flex items-center justify-center w-44 h-44">
        {/* Outer ring — rotation speed from phase */}
        <motion.svg
          className="absolute inset-0 w-full h-full"
          animate={{ rotate: 360 }}
          transition={{ duration: s.rotationSpeed, repeat: Infinity, ease: 'linear' }}
          style={{ filter: filterStyle }}
        >
          {/* Dashed outer track */}
          <circle
            cx="88" cy="88" r="82"
            fill="none"
            stroke={s.color}
            strokeWidth="0.8"
            strokeDasharray="10 8"
            opacity={s.opacity * 0.6}
          />
          {/* Bright arc sweep */}
          <circle
            cx="88" cy="88" r="82"
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray={isActive ? '50 180' : '30 200'}
            opacity={s.opacity}
          />
        </motion.svg>

        {/* Middle ring — counter-rotate, slower */}
        <motion.svg
          className="absolute inset-0 w-full h-full"
          animate={{ rotate: -360 }}
          transition={{ duration: s.rotationSpeed * 1.6, repeat: Infinity, ease: 'linear' }}
        >
          <circle
            cx="88" cy="88" r="66"
            fill="none"
            stroke={s.color}
            strokeWidth="0.5"
            strokeDasharray="4 16"
            opacity={s.opacity * 0.4}
          />
          {/* Tick marks */}
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <line
              key={deg}
              x1="88" y1="22"
              x2="88" y2="30"
              stroke={s.color}
              strokeWidth="1.5"
              opacity={s.opacity * 0.8}
              transform={`rotate(${deg} 88 88)`}
            />
          ))}
        </motion.svg>

        {/* Inner glow halo */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width:        '52%',
            height:       '52%',
            background:   `radial-gradient(circle, ${s.glowColor} 0%, transparent 70%)`,
          }}
          animate={isActive
            ? { scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }
            : { scale: [1, 1.04, 1], opacity: [0.2, 0.4, 0.2] }
          }
          transition={{
            duration: s.coreDuration,
            repeat:   Infinity,
            ease:     'easeInOut',
          }}
        />

        {/* Core pulse circle — Stark inner-core */}
        <motion.div
          className="absolute rounded-full border"
          style={{
            width:       '44%',
            height:      '44%',
            borderColor: `${s.color}55`,
            background:  `${s.color}0a`,
          }}
          animate={{
            scale:   s.coreScale,
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: s.coreDuration,
            repeat:   Infinity,
            ease:     'easeInOut',
          }}
        />

        {/* Center dot — reactor core */}
        <motion.div
          className="w-4 h-4 rounded-full"
          style={{
            background: s.color,
            boxShadow:  `0 0 10px ${s.color}, 0 0 30px ${s.glowColor}, 0 0 60px ${s.glowColor}55`,
          }}
          animate={{ scale: [1, s.coreScale[1] * 0.8, 1] }}
          transition={{ duration: s.coreDuration, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Token counter — shows during streaming */}
        <AnimatePresence>
          {streamPhase === 'streaming' && tokenCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-2 right-2 text-[8px] font-mono"
              style={{ color: s.color, opacity: 0.6 }}
            >
              {tokenCount}t
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Waveform bars — Stark: shown during activity */}
      <div className="flex items-end gap-[2px] h-5 mt-1">
        {barDelays.map((delay, i) => (
          <motion.div
            key={i}
            className="w-[2.5px] rounded-sm"
            style={{
              background: s.color,
              opacity:    showWave ? 0.8 : 0.15,
            }}
            animate={showWave
              ? { scaleY: [0.15, 1, 0.15], opacity: [0.5, 1, 0.5] }
              : { scaleY: 0.15, opacity: 0.1 }
            }
            transition={{
              duration:   showWave ? 0.5 + (i % 3) * 0.15 : 0,
              repeat:     showWave ? Infinity : 0,
              delay,
              ease:       'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  )
}
