import { useEffect, useRef, useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import type { StreamPhase } from '@/types'

type PhaseVisual = {
  r: number; g: number; b: number
  pulseSec: number; ringSpeed: number; particleRate: number
  ambient: number; bloom: number; core: number; flare: number
}

// Offline: orange glow — reactor dormant, awaiting activation
const OFFLINE: PhaseVisual = {
  r: 255, g: 110, b: 40, pulseSec: 4.5, ringSpeed: 0.14, particleRate: 0.015,
  ambient: 0.38, bloom: 0.44, core: 0.55, flare: 0.08,
}

const BOOTING: PhaseVisual = {
  r: 255, g: 128, b: 52, pulseSec: 4.0, ringSpeed: 0.18, particleRate: 0.025,
  ambient: 0.34, bloom: 0.4, core: 0.52, flare: 0.1,
}

const PHASES: Record<StreamPhase, PhaseVisual> = {
  idle:      { r: 0,  g: 212, b: 255, pulseSec: 3.1,  ringSpeed: 0.34, particleRate: 0.08, ambient: 0.52, bloom: 0.58, core: 0.74, flare: 0.22 },
  start:     { r: 70, g: 236, b: 255, pulseSec: 1.2,  ringSpeed: 0.92, particleRate: 0.2,  ambient: 0.66, bloom: 0.76, core: 0.92, flare: 0.42 },
  streaming: { r: 88, g: 244, b: 255, pulseSec: 0.78, ringSpeed: 1.6,  particleRate: 0.4,  ambient: 0.82, bloom: 0.98, core: 1.08, flare: 0.66 },
  complete:  { r: 0,  g: 255, b: 152, pulseSec: 1.55, ringSpeed: 0.5,  particleRate: 0.14, ambient: 0.58, bloom: 0.68, core: 0.88, flare: 0.3  },
  error:     { r: 255,g: 122, b: 56,  pulseSec: 0.42, ringSpeed: 2.15, particleRate: 0.3,  ambient: 0.74, bloom: 0.88, core: 0.96, flare: 0.56 },
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function rgba(rgb: string, alpha: number) { return `rgba(${rgb},${Math.max(0, Math.min(alpha, 1))})` }

export function ReactorOrb({
  size = 260,
}: {
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const setReactorVisualLive = useJarvisStore((s) => s.setReactorVisualLive)
  const [hovered, setHovered] = useState(false)
  const [burstNonce, setBurstNonce] = useState(0)
  const [focusPulse, setFocusPulse] = useState(false)
  const focusTimerRef = useRef<number | null>(null)

  const onlineRef = useRef(false)
  onlineRef.current = reactorVisualLive
  const visualLiveRef = useRef(false)
  visualLiveRef.current = reactorVisualLive

  const phaseRef = useRef<StreamPhase>('idle')
  phaseRef.current = streamPhase
  const hoveredRef = useRef(false)
  hoveredRef.current = hovered

  const anim = useRef({
    outerAngle: 0, midAngle: 0, innerAngle: 0, time: 0,
    particles: [] as Particle[],
    hoverAlpha: 0,           // 0 = no hover, 1 = full hover
    // interpolated visuals
    cr: BOOTING.r, cg: BOOTING.g, cb: BOOTING.b,
    cPulse: BOOTING.pulseSec, cRing: BOOTING.ringSpeed,
    cParticle: BOOTING.particleRate, cAmbient: BOOTING.ambient,
    cBloom: BOOTING.bloom, cCore: BOOTING.core, cFlare: BOOTING.flare,
  })

  const C = Math.ceil(size * 2.55)

  const handleClick = useCallback(() => {
    setHovered(false)
    setBurstNonce((value) => value + 1)
    setReactorVisualLive(true)
    setFocusPulse(true)
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current)
    focusTimerRef.current = window.setTimeout(() => {
      setFocusPulse(false)
      focusTimerRef.current = null
    }, 720)
  }, [setReactorVisualLive])

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = C * dpr
    canvas.height = C * dpr
    const center = C / 2
    const R = size / 2
    let raf = 0

    const draw = () => {
      const a = anim.current
      const online = onlineRef.current
      const target: PhaseVisual = visualLiveRef.current
        ? (ocStatus.online ? PHASES[phaseRef.current] : PHASES.idle)
        : BOOTING
      const sp = online ? 0.06 : 0.04
      const hoverTarget = !online && hoveredRef.current ? 1 : 0

      a.cr = lerp(a.cr, target.r, sp);   a.cg = lerp(a.cg, target.g, sp);   a.cb = lerp(a.cb, target.b, sp)
      a.cPulse    = lerp(a.cPulse,    target.pulseSec,    sp)
      a.cRing     = lerp(a.cRing,     target.ringSpeed,   sp)
      a.cParticle = lerp(a.cParticle, target.particleRate,sp)
      a.cAmbient  = lerp(a.cAmbient,  target.ambient,     sp)
      a.cBloom    = lerp(a.cBloom,    target.bloom,       sp)
      a.cCore     = lerp(a.cCore,     target.core,        sp)
      a.cFlare    = lerp(a.cFlare,    target.flare,       sp)
      a.hoverAlpha = lerp(a.hoverAlpha, hoverTarget, 0.12)
      a.time += 1 / 60

      const pulse = Math.sin(a.time * Math.PI * 2 / a.cPulse) * 0.5 + 0.5
      const rgb = `${Math.round(a.cr)},${Math.round(a.cg)},${Math.round(a.cb)}`
      const fieldRadius = R * 2.8
      const bloomRadius = R * 1.95

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, C, C)

      // ── HOVER GLOW (offline only) ─────────────────────────────────────────
      if (!online && a.hoverAlpha > 0) {
        const hoverGrad = ctx.createRadialGradient(center, center, 0, center, center, R * 1.6)
        hoverGrad.addColorStop(0, rgba(rgb, 0.34 * a.hoverAlpha * (0.7 + pulse * 0.3)))
        hoverGrad.addColorStop(0.5, rgba(rgb, 0.12 * a.hoverAlpha))
        hoverGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = hoverGrad
        ctx.fillRect(0, 0, C, C)

        ctx.strokeStyle = rgba(rgb, 0.62 * a.hoverAlpha * (0.6 + pulse * 0.4))
        ctx.lineWidth = 2
        ctx.setLineDash([6, 6])
        ctx.beginPath(); ctx.arc(center, center, R + 6 + pulse * 4, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      }

      // ── AMBIENT FIELD ─────────────────────────────────────────────────────
      const ambientField = ctx.createRadialGradient(center, center, 0, center, center, fieldRadius)
      ambientField.addColorStop(0,    rgba(rgb, a.cAmbient * (0.44 + pulse * 0.18)))
      ambientField.addColorStop(0.18, rgba(rgb, a.cAmbient * (0.28 + pulse * 0.12)))
      ambientField.addColorStop(0.42, rgba(rgb, a.cAmbient * 0.14))
      ambientField.addColorStop(0.72, rgba(rgb, a.cAmbient * 0.05))
      ambientField.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = ambientField
      ctx.fillRect(0, 0, C, C)

      const bloomField = ctx.createRadialGradient(center, center, R * 0.18, center, center, bloomRadius)
      bloomField.addColorStop(0,    rgba(rgb, a.cBloom * (0.72 + pulse * 0.16)))
      bloomField.addColorStop(0.28, rgba(rgb, a.cBloom * (0.44 + pulse * 0.12)))
      bloomField.addColorStop(0.56, rgba(rgb, a.cBloom * 0.18))
      bloomField.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bloomField
      ctx.beginPath(); ctx.arc(center, center, bloomRadius, 0, Math.PI * 2); ctx.fill()

      // ── OUTER RING ────────────────────────────────────────────────────────
      a.outerAngle += a.cRing
      ctx.save(); ctx.translate(center, center); ctx.rotate(a.outerAngle * Math.PI / 180)

      ctx.strokeStyle = rgba(rgb, 0.28 + pulse * 0.12); ctx.lineWidth = 1.2
      ctx.setLineDash([4, 9])
      ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      ctx.strokeStyle = rgba(rgb, 0.72 + pulse * 0.24)
      ctx.lineWidth = 3.4; ctx.lineCap = 'round'
      ctx.shadowColor = rgba(rgb, 0.88); ctx.shadowBlur = 24
      ctx.beginPath(); ctx.arc(0, 0, R - 3, -0.78, 2.14); ctx.stroke()

      ctx.strokeStyle = rgba(rgb, 0.32 + pulse * 0.12); ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.arc(0, 0, R - 8, Math.PI - 0.4, Math.PI + 0.9); ctx.stroke()
      ctx.shadowBlur = 0

      for (let i = 0; i < 16; i++) {
        const ang = i * (Math.PI * 2 / 16)
        const major = i % 4 === 0
        ctx.strokeStyle = rgba(rgb, major ? 0.64 + pulse * 0.18 : 0.28)
        ctx.lineWidth = major ? 2.1 : 0.9
        ctx.beginPath()
        ctx.moveTo(Math.cos(ang) * (R - (major ? 14 : 9)), Math.sin(ang) * (R - (major ? 14 : 9)))
        ctx.lineTo(Math.cos(ang) * (R + (major ? 3 : 1)), Math.sin(ang) * (R + (major ? 3 : 1)))
        ctx.stroke()
      }
      ctx.restore()

      // ── MIDDLE RING ───────────────────────────────────────────────────────
      a.midAngle -= a.cRing * 0.45
      const midR = R * 0.78
      ctx.save(); ctx.translate(center, center); ctx.rotate(a.midAngle * Math.PI / 180)
      ctx.strokeStyle = rgba(rgb, 0.16); ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(0, 0, midR, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = rgba(rgb, 0.52 + pulse * 0.18); ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.shadowColor = rgba(rgb, 0.6); ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(0, 0, midR, 0.25, 1.9); ctx.stroke()
      ctx.shadowBlur = 0
      for (let i = 0; i < 6; i++) {
        const ang = i * (Math.PI * 2 / 6)
        ctx.fillStyle = rgba(rgb, 0.4 + pulse * 0.16)
        ctx.beginPath(); ctx.arc(Math.cos(ang) * midR, Math.sin(ang) * midR, 2.2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()

      // ── INNER RING ────────────────────────────────────────────────────────
      a.innerAngle += a.cRing * 0.72
      const innerR = R * 0.58
      ctx.save(); ctx.translate(center, center); ctx.rotate(-a.innerAngle * Math.PI / 180)
      ctx.strokeStyle = rgba(rgb, 0.18); ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = rgba(rgb, 0.64 + pulse * 0.22); ctx.lineWidth = 2.2; ctx.lineCap = 'round'
      ctx.shadowColor = rgba(rgb, 0.72); ctx.shadowBlur = 10
      ctx.beginPath(); ctx.arc(0, 0, innerR, -0.24, 1.44); ctx.stroke()
      ctx.shadowBlur = 0
      ctx.restore()

      // ── CORE SPHERE ───────────────────────────────────────────────────────
      const coreR = R * 0.48
      const liveR = coreR * (1 + pulse * 0.08)

      const shellGlow = ctx.createRadialGradient(center, center, 0, center, center, liveR * 1.45)
      shellGlow.addColorStop(0,  rgba('255,255,255', 0.24 * a.cCore))
      shellGlow.addColorStop(0.18, rgba(rgb, 0.78 * a.cCore))
      shellGlow.addColorStop(0.48, rgba(rgb, 0.3 * a.cCore))
      shellGlow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shellGlow
      ctx.beginPath(); ctx.arc(center, center, liveR * 1.28, 0, Math.PI * 2); ctx.fill()

      const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, liveR)
      coreGrad.addColorStop(0,    'rgba(255,255,255,1)')
      coreGrad.addColorStop(0.14, rgba('255,255,255', 0.98))
      coreGrad.addColorStop(0.28, rgba(rgb, 0.92 * a.cCore))
      coreGrad.addColorStop(0.58, rgba(rgb, 0.5 * a.cCore))
      coreGrad.addColorStop(0.86, rgba(rgb, 0.18 * a.cCore))
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.shadowColor = rgba(rgb, 0.96); ctx.shadowBlur = 78
      ctx.fillStyle = coreGrad
      ctx.beginPath(); ctx.arc(center, center, liveR, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0

      const innerCore = ctx.createRadialGradient(center, center, 0, center, center, liveR * 0.62)
      innerCore.addColorStop(0, 'rgba(255,255,255,0.92)')
      innerCore.addColorStop(0.5, rgba('255,255,255', 0.28 * a.cCore))
      innerCore.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = innerCore
      ctx.beginPath(); ctx.arc(center, center, liveR * 0.62, 0, Math.PI * 2); ctx.fill()

      ctx.strokeStyle = rgba(rgb, 0.4 + pulse * 0.18); ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.arc(center, center, liveR * 0.6, 0, Math.PI * 2); ctx.stroke()

      // Lens flare streak
      const flareWidth = liveR * 2.25
      const flareGrad = ctx.createLinearGradient(center - flareWidth, center, center + flareWidth, center)
      flareGrad.addColorStop(0,   'rgba(255,255,255,0)')
      flareGrad.addColorStop(0.2, rgba(rgb, 0.16 * a.cFlare))
      flareGrad.addColorStop(0.5, rgba('255,255,255', 0.82 * a.cFlare))
      flareGrad.addColorStop(0.8, rgba(rgb, 0.16 * a.cFlare))
      flareGrad.addColorStop(1,   'rgba(255,255,255,0)')
      ctx.fillStyle = flareGrad
      ctx.fillRect(center - flareWidth, center - 2.4, flareWidth * 2, 4.8)

      // ── PARTICLES ─────────────────────────────────────────────────────────
      if (Math.random() < a.cParticle) {
        const ang = Math.random() * Math.PI * 2
        const dist = innerR * 0.88 + Math.random() * (R * 0.36)
        a.particles.push({ x: center + Math.cos(ang) * dist, y: center + Math.sin(ang) * dist, vx: (Math.random() - 0.5) * 0.42, vy: -0.16 - Math.random() * 0.46, life: 0, maxLife: 38 + Math.random() * 58, size: 1 + Math.random() * 2.3 })
      }
      a.particles = a.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life++
        if (p.life > p.maxLife) return false
        const lr = p.life / p.maxLife
        const al = lr < 0.18 ? lr / 0.18 : 1 - (lr - 0.18) / 0.82
        ctx.fillStyle = rgba(rgb, al * 0.88)
        ctx.shadowColor = rgba(rgb, al * 0.72); ctx.shadowBlur = 12
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - lr * 0.38), 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
        return true
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [C, size])

  const online = reactorVisualLive
  const booting = !reactorVisualLive
  const clickable = true
  const labelColor = online ? '#7ef4ff' : '#ff9a54'
  const shellGlow = online
    ? 'radial-gradient(circle, rgba(88,244,255,0.34) 0%, rgba(0,212,255,0.14) 34%, rgba(0,0,0,0) 72%)'
    : 'radial-gradient(circle, rgba(255,160,86,0.34) 0%, rgba(255,110,40,0.14) 34%, rgba(0,0,0,0) 72%)'
  const burstIds = [0, 1, 2, 3]

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        overflow: 'visible',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          width: size * 1.9,
          height: size * 1.9,
          left: -size * 0.45,
          top: -size * 0.45,
          background: shellGlow,
          filter: 'blur(16px)',
          opacity: online ? 1 : hovered ? 1 : 0.72,
        }}
        animate={online
          ? { scale: focusPulse ? [1, 1.1, 1.03] : [1, 1.05, 1], opacity: [0.78, 1, 0.78] }
          : booting
            ? { scale: [1, 1.04, 1], opacity: [0.54, 0.78, 0.54] }
          : hovered
            ? { scale: [1, 1.08, 1], opacity: [0.76, 1, 0.76] }
            : { scale: [1, 1.03, 1], opacity: [0.52, 0.72, 0.52] }
        }
        transition={{ duration: online ? 1.6 : 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          width: C, height: C,
          left: (size - C) / 2,
          top: (size - C) / 2,
          pointerEvents: 'none',
        }}
      />

      {!online && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            width: size * 0.98,
            height: size * 0.98,
            left: size * 0.01,
            top: size * 0.01,
            border: '1.5px dashed rgba(255,156,86,0.74)',
            boxShadow: hovered ? '0 0 28px rgba(255,138,74,0.42)' : '0 0 14px rgba(255,138,74,0.18)',
          }}
          animate={hovered
            ? { opacity: [0.34, 0.96, 0.34], scale: [1, 1.04, 1] }
            : { opacity: 0.16, scale: 1 }
          }
          transition={{ duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <AnimatePresence>
        {focusPulse && burstIds.map((id) => (
          <motion.div
            key={`${burstNonce}-${id}`}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: size * 0.5,
              top: size * 0.5,
              width: size * 0.52,
              height: size * 0.52,
              marginLeft: -size * 0.26,
              marginTop: -size * 0.26,
              border: '2px solid rgba(255,255,255,0.95)',
              boxShadow: online ? '0 0 18px rgba(120,232,255,0.45)' : '0 0 18px rgba(255,255,255,0.35)',
            }}
            initial={{ scale: 0.42, opacity: 0.96 }}
            animate={{ scale: 2.3 + id * 0.26, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, delay: id * 0.08, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>

      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={clickable ? handleClick : undefined}
        style={{
          position: 'absolute',
          width: size * 0.75,
          height: size * 0.75,
          left: size * 0.125,
          top: size * 0.125,
          borderRadius: '50%',
          cursor: clickable ? 'pointer' : 'default',
          zIndex: 10,
        }}
      />

      <motion.p
        className="pointer-events-none absolute left-1/2 font-mono text-[11px] tracking-[0.32em]"
        style={{
          top: size + 10,
          transform: 'translateX(-50%)',
          color: labelColor,
          textShadow: online ? '0 0 12px rgba(0,212,255,0.45)' : '0 0 12px rgba(255,138,74,0.45)',
        }}
        animate={online
          ? { opacity: [0.72, 1, 0.72] }
          : booting
            ? { opacity: [0.52, 0.92, 0.52] }
            : { opacity: [0.44, 0.92, 0.44] }
        }
        transition={{ duration: online ? 1.8 : 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {online ? 'ONLINE' : 'OFFLINE'}
      </motion.p>
    </div>
  )
}
