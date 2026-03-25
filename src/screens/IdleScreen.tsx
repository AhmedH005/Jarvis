import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ReactorOrb } from '@/components/hud/ReactorOrb'
import { useUIState } from '@/store/uiState'

function makeParticles(count: number) {
  return Array.from({ length: count }, () => ({
    w: 2 + Math.random() * 3,
    left: 10 + Math.random() * 80,
    top: 10 + Math.random() * 80,
    yTravel: -20 - Math.random() * 30,
    dur: 4 + Math.random() * 4,
    delay: Math.random() * 3,
  }))
}

export function IdleScreen() {
  const mode = useUIState((s) => s.mode)
  const setMode = useUIState((s) => s.setMode)
  const particles = useMemo(() => makeParticles(12), [])
  const isActivating = mode === 'activating'

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={isActivating
        ? { opacity: 1, x: [0, -2, 3, -1, 2, -3, 1, -2, 3, 0], y: [0, 1, -2, 3, -1, 2, -3, 1, -1, 0] }
        : { opacity: 1 }
      }
      exit={{
        opacity: 0,
        scale: 1.06,
        filter: 'blur(10px)',
        transition: { duration: 0.9, ease: [0.4, 0, 0.2, 1] },
      }}
      transition={isActivating
        ? { x: { duration: 4, ease: 'linear' }, y: { duration: 4, ease: 'linear' }, opacity: { duration: 0.6 } }
        : { duration: 0.6 }
      }
    >
      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.w,
              height: p.w,
              left: `${p.left}%`,
              top: `${p.top}%`,
              background: 'rgba(255,138,74,0.4)',
              boxShadow: '0 0 6px rgba(255,138,74,0.3)',
            }}
            animate={{
              y: [0, p.yTravel, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: p.dur,
              repeat: Infinity,
              delay: p.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Activation flash effects */}
      {isActivating && <ActivationOverlay />}

      {/* Centered orb */}
      <div
        className="relative cursor-pointer"
        onClick={() => { if (!isActivating) setMode('activating') }}
      >
        <ReactorOrb size={260} activating={isActivating} />
      </div>

      {/* Instruction / status text */}
      {isActivating
        ? <ActivationStatus />
        : (
          <motion.p
            className="mt-8 font-mono text-[11px] tracking-[0.28em] select-none"
            style={{ color: 'rgba(255,156,86,0.5)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0.3, 0.6, 0.3], y: 0 }}
            transition={{
              opacity: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
              y: { duration: 0.8, delay: 0.4 },
            }}
          >
            CLICK TO ACTIVATE
          </motion.p>
        )
      }
    </motion.div>
  )
}

// ── Activation flash overlay ────────────────────────────────────────────────────

function ActivationOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Accelerating white flash pulses — frequency increases */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.35), transparent 55%)' }}
        animate={{ opacity: [0, 0.12, 0, 0.2, 0, 0.3, 0, 0.45, 0, 0.6, 0, 0.8, 0, 0.5, 0] }}
        transition={{ duration: 4, ease: 'linear' }}
      />

      {/* Orange glow — fades out as activation progresses */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,140,60,0.4), transparent 65%)' }}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 3, ease: 'easeIn' }}
      />

      {/* Cyan glow — fades in during second half */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(0,212,255,0.35), transparent 65%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 0.15, 0.35, 0.6, 0.8, 0.5] }}
        transition={{ duration: 4, ease: 'easeOut' }}
      />

      {/* White-hot core flash at peak */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.5), transparent 30%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 0, 0.9, 0.3, 0.6, 0.15, 0] }}
        transition={{ duration: 4, ease: 'easeInOut' }}
      />

      {/* Expanding energy rings — staggered, shift from orange to cyan */}
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <motion.div
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: '50%',
            top: '50%',
            width: 0,
            height: 0,
            border: `1.5px solid ${i < 3 ? 'rgba(255,180,80,0.5)' : i < 5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,212,255,0.5)'}`,
            boxShadow: i < 3
              ? '0 0 12px rgba(255,140,60,0.3)'
              : '0 0 12px rgba(0,212,255,0.3)',
          }}
          animate={{
            width: ['0vw', '180vw'],
            height: ['0vw', '180vw'],
            marginLeft: ['0vw', '-90vw'],
            marginTop: ['0vw', '-90vw'],
            opacity: [0.9, 0],
          }}
          transition={{ duration: 1.6, delay: 0.2 + i * 0.48, ease: 'easeOut' }}
        />
      ))}

      {/* Horizontal scan line sweep — accelerating */}
      <motion.div
        className="absolute left-0 right-0"
        style={{
          height: 3,
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 30%, rgba(0,212,255,0.8) 50%, rgba(255,255,255,0.6) 70%, transparent 100%)',
          boxShadow: '0 0 20px rgba(0,212,255,0.5)',
        }}
        initial={{ top: '20%', opacity: 0 }}
        animate={{ top: ['20%', '80%', '15%', '85%', '10%', '90%', '50%'], opacity: [0, 0.8, 0.6, 0.9, 0.7, 1, 0] }}
        transition={{ duration: 3.8, ease: 'easeInOut' }}
      />

      {/* Secondary vertical scan */}
      <motion.div
        className="absolute top-0 bottom-0"
        style={{
          width: 2,
          background: 'linear-gradient(180deg, transparent 0%, rgba(255,200,100,0.5) 30%, rgba(255,255,255,0.7) 50%, rgba(255,200,100,0.5) 70%, transparent 100%)',
          boxShadow: '0 0 16px rgba(255,200,100,0.4)',
        }}
        initial={{ left: '30%', opacity: 0 }}
        animate={{ left: ['30%', '70%', '25%', '75%', '50%'], opacity: [0, 0.6, 0.4, 0.7, 0] }}
        transition={{ duration: 3.2, delay: 0.5, ease: 'easeInOut' }}
      />

      {/* Screen edge vignette pulse */}
      <motion.div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.6)',
        }}
        animate={{ opacity: [0.3, 0.8, 0.3, 0.9, 0.4, 1, 0.5] }}
        transition={{ duration: 4, ease: 'linear' }}
      />
    </div>
  )
}

// ── Activation status text progression ──────────────────────────────────────────

function ActivationStatus() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000)
    const t2 = setTimeout(() => setPhase(2), 2200)
    const t3 = setTimeout(() => setPhase(3), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const text =
    phase === 0 ? 'INITIALIZING...'
    : phase === 1 ? 'CONNECTING SYSTEMS...'
    : phase === 2 ? 'REACTOR POWERING UP...'
    : 'SYSTEMS ONLINE'

  const color = phase < 2
    ? 'rgba(255,156,86,0.8)'
    : phase === 2
    ? 'rgba(200,220,255,0.8)'
    : 'rgba(126,244,255,0.9)'

  const glow = phase < 2
    ? '0 0 14px rgba(255,138,74,0.6)'
    : '0 0 14px rgba(0,212,255,0.6)'

  return (
    <motion.p
      className="mt-8 font-mono text-[12px] tracking-[0.3em] select-none"
      style={{ color, textShadow: glow, transition: 'color 0.6s ease, text-shadow 0.6s ease' }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      {text}
    </motion.p>
  )
}
