import { useEffect, useRef } from 'react'
import { useJarvisStore } from '@/store/jarvis'
import { useUIState } from '@/store/uiState'
import type { StreamPhase } from '@/types'

interface BgParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  phase: number
  phaseSpeed: number
}

const PHASES: Record<StreamPhase, {
  r: number
  g: number
  b: number
  grid: number
  major: number
  dots: number
  diagonals: number
  glow: number
  particleBoost: number
  scan: number
  drift: number
}> = {
  idle:      { r: 0,   g: 212, b: 255, grid: 0.14, major: 0.24, dots: 0.18, diagonals: 0.05, glow: 0.34, particleBoost: 1,   scan: 0.08, drift: 0.05 },
  start:     { r: 70,  g: 236, b: 255, grid: 0.2,  major: 0.3,  dots: 0.28, diagonals: 0.08, glow: 0.46, particleBoost: 1.45, scan: 0.12, drift: 0.1 },
  streaming: { r: 88,  g: 244, b: 255, grid: 0.24, major: 0.36, dots: 0.34, diagonals: 0.11, glow: 0.58, particleBoost: 1.9,  scan: 0.18, drift: 0.16 },
  complete:  { r: 0,   g: 255, b: 152, grid: 0.16, major: 0.24, dots: 0.2,  diagonals: 0.06, glow: 0.38, particleBoost: 1.15, scan: 0.1,  drift: 0.07 },
  error:     { r: 255, g: 122, b: 56,  grid: 0.2,  major: 0.34, dots: 0.26, diagonals: 0.1,  glow: 0.48, particleBoost: 1.5,  scan: 0.16, drift: 0.13 },
}

const BOOTING = {
  r: 255,
  g: 136,
  b: 72,
  grid: 0.12,
  major: 0.2,
  dots: 0.12,
  diagonals: 0.045,
  glow: 0.28,
  particleBoost: 0.95,
  scan: 0.075,
  drift: 0.05,
}

const OFFLINE = {
  r: 255,
  g: 132,
  b: 68,
  grid: 0.16,
  major: 0.28,
  dots: 0.18,
  diagonals: 0.06,
  glow: 0.36,
  particleBoost: 1,
  scan: 0.1,
  drift: 0.06,
}

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${Math.max(0, Math.min(alpha, 1))})`
}

export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<StreamPhase>('idle')
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const appMode = useUIState((s) => s.mode)
  phaseRef.current = streamPhase
  const ocOnlineRef = useRef(false)
  ocOnlineRef.current = ocStatus.online
  const visualLiveRef = useRef(false)
  visualLiveRef.current = reactorVisualLive
  const appModeRef = useRef(appMode)
  appModeRef.current = appMode

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    let time = 0
    let gridOffset = 0
    const particles: BgParticle[] = []
    // Smoothly interpolated glow center Y ratio + intensity multiplier
    let glowYRatio = 0.5    // start centered (idle position)
    let glowIntensity = 1.0 // full intensity
    let activateProgress = 0 // 0→1 over activation sequence
    const visual = {
      r: BOOTING.r,
      g: BOOTING.g,
      b: BOOTING.b,
      grid: BOOTING.grid,
      major: BOOTING.major,
      dots: BOOTING.dots,
      diagonals: BOOTING.diagonals,
      glow: BOOTING.glow,
      particleBoost: BOOTING.particleBoost,
      scan: BOOTING.scan,
      drift: BOOTING.drift,
    }

    const ensureParticles = () => {
      const desired = Math.max(90, Math.round((w * h) / 18000))
      while (particles.length < desired) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.18,
          vy: -0.1 - Math.random() * 0.28,
          size: 0.7 + Math.random() * 2.6,
          alpha: 0.16 + Math.random() * 0.34,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.012 + Math.random() * 0.024,
        })
      }
      particles.length = desired
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ensureParticles()
    }

    resize()
    window.addEventListener('resize', resize)

    const lerpN = (a: number, b: number, t: number) => a + (b - a) * t

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      let phase =
        !visualLiveRef.current ? BOOTING
        : ocOnlineRef.current ? PHASES[phaseRef.current] : PHASES.idle
      let easing = visualLiveRef.current ? 0.05 : 0.04

      // Activation overdrive — ramp up all visuals with color cycling
      if (appModeRef.current === 'activating') {
        activateProgress = Math.min(activateProgress + 1 / 240, 1.0) // 4s at 60fps
        const ap = activateProgress

        // Color cycle: orange → white-hot → cyan
        let ar: number, ag: number, ab: number
        if (ap < 0.3) {
          const t = ap / 0.3
          ar = lerpN(255, 255, t); ag = lerpN(136, 240, t); ab = lerpN(72, 210, t)
        } else if (ap < 0.6) {
          const t = (ap - 0.3) / 0.3
          ar = lerpN(255, 50, t); ag = lerpN(240, 235, t); ab = lerpN(210, 255, t)
        } else {
          const t = (ap - 0.6) / 0.4
          ar = lerpN(50, 0, t); ag = lerpN(235, 212, t); ab = 255
        }

        phase = {
          r: ar, g: ag, b: ab,
          grid: lerpN(0.14, 0.48, ap),
          major: lerpN(0.24, 0.62, ap),
          dots: lerpN(0.18, 0.52, ap),
          diagonals: lerpN(0.05, 0.22, ap),
          glow: lerpN(0.34, 1.0, ap),
          particleBoost: lerpN(1, 3.8, ap),
          scan: lerpN(0.08, 0.45, ap),
          drift: lerpN(0.05, 0.55, ap),
        }
        easing = 0.12
      } else if (activateProgress > 0) {
        activateProgress = Math.max(activateProgress - 0.015, 0)
      }

      visual.r += (phase.r - visual.r) * easing
      visual.g += (phase.g - visual.g) * easing
      visual.b += (phase.b - visual.b) * easing
      visual.grid += (phase.grid - visual.grid) * easing
      visual.major += (phase.major - visual.major) * easing
      visual.dots += (phase.dots - visual.dots) * easing
      visual.diagonals += (phase.diagonals - visual.diagonals) * easing
      visual.glow += (phase.glow - visual.glow) * easing
      visual.particleBoost += (phase.particleBoost - visual.particleBoost) * easing
      visual.scan += (phase.scan - visual.scan) * easing
      visual.drift += (phase.drift - visual.drift) * easing

      const rgb = `${Math.round(visual.r)},${Math.round(visual.g)},${Math.round(visual.b)}`
      const gridStep = 62
      const majorEvery = 4

      time += 1 / 60
      gridOffset = (gridOffset + visual.drift) % gridStep

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const base = ctx.createLinearGradient(0, 0, 0, h)
      base.addColorStop(0, '#02070f')
      base.addColorStop(0.38, '#06101a')
      base.addColorStop(1, '#03070e')
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)

      // Smoothly lerp glow position and intensity based on app mode
      const currentMode = appModeRef.current
      const targetYRatio = (currentMode === 'boot' || currentMode === 'idle' || currentMode === 'activating') ? 0.5 : 0.26
      const targetIntensity = currentMode === 'active' ? 0.15 : 1.0
      glowYRatio += (targetYRatio - glowYRatio) * 0.025
      glowIntensity += (targetIntensity - glowIntensity) * 0.03

      const glowX = w * 0.5
      const glowY = h * glowYRatio
      const glowPulse = 0.5 + Math.sin(time * 0.85) * 0.5
      const gi = glowIntensity // shorthand

      const upperGlow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(w, h) * 0.64)
      upperGlow.addColorStop(0, rgba(rgb, visual.glow * (0.9 + glowPulse * 0.32) * gi))
      upperGlow.addColorStop(0.16, rgba(rgb, visual.glow * 0.52 * gi))
      upperGlow.addColorStop(0.38, rgba(rgb, visual.glow * 0.18 * gi))
      upperGlow.addColorStop(0.72, rgba(rgb, visual.glow * 0.05 * gi))
      upperGlow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = upperGlow
      ctx.fillRect(0, 0, w, h)

      const focusedGlow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.min(w, h) * 0.22)
      focusedGlow.addColorStop(0, rgba('255,255,255', 0.16 * gi))
      focusedGlow.addColorStop(0.22, rgba(rgb, visual.glow * 0.7 * gi))
      focusedGlow.addColorStop(0.64, rgba(rgb, visual.glow * 0.16 * gi))
      focusedGlow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = focusedGlow
      ctx.fillRect(0, 0, w, h)

      ctx.lineWidth = 0.9
      for (let x = -gridStep; x < w + gridStep; x += gridStep) {
        const actualX = x + (gridOffset % gridStep)
        const major = Math.round((x + gridStep) / gridStep) % majorEvery === 0
        ctx.strokeStyle = rgba(rgb, major ? visual.major : visual.grid)
        ctx.beginPath()
        ctx.moveTo(actualX, 0)
        ctx.lineTo(actualX, h)
        ctx.stroke()
      }
      for (let y = -gridStep; y < h + gridStep; y += gridStep) {
        const actualY = y + (gridOffset % gridStep)
        const major = Math.round((y + gridStep) / gridStep) % majorEvery === 0
        ctx.strokeStyle = rgba(rgb, major ? visual.major : visual.grid)
        ctx.beginPath()
        ctx.moveTo(0, actualY)
        ctx.lineTo(w, actualY)
        ctx.stroke()
      }

      ctx.lineWidth = 0.7
      ctx.strokeStyle = rgba(rgb, visual.diagonals)
      for (let d = -h; d < w + h; d += 180) {
        ctx.beginPath()
        ctx.moveTo(d + gridOffset * 2.2, 0)
        ctx.lineTo(d - h + gridOffset * 2.2, h)
        ctx.stroke()
      }

      for (let x = -gridStep; x < w + gridStep; x += gridStep) {
        const actualX = x + (gridOffset % gridStep)
        for (let y = -gridStep; y < h + gridStep; y += gridStep) {
          const actualY = y + (gridOffset % gridStep)
          ctx.fillStyle = rgba(rgb, visual.dots)
          ctx.beginPath()
          ctx.arc(actualX, actualY, 1.35, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy * visual.particleBoost
        particle.phase += particle.phaseSpeed

        if (particle.y < -16) {
          particle.y = h + 16
          particle.x = Math.random() * w
        }
        if (particle.x < -16) particle.x = w + 16
        if (particle.x > w + 16) particle.x = -16

        const alpha = particle.alpha * (0.45 + Math.sin(particle.phase) * 0.55) * visual.particleBoost
        ctx.fillStyle = rgba(rgb, Math.min(alpha, 0.8))
        ctx.shadowColor = rgba(rgb, Math.min(alpha, 0.6))
        ctx.shadowBlur = 14
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      const scanY = (time * 34) % (h + 180) - 90
      const scan = ctx.createLinearGradient(0, scanY - 90, 0, scanY + 90)
      scan.addColorStop(0, 'rgba(255,255,255,0)')
      scan.addColorStop(0.35, rgba(rgb, visual.scan * 0.35))
      scan.addColorStop(0.5, rgba('255,255,255', visual.scan))
      scan.addColorStop(0.65, rgba(rgb, visual.scan * 0.35))
      scan.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = scan
      ctx.fillRect(0, scanY - 90, w, 180)

      const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.8)
      vignette.addColorStop(0, 'rgba(3,7,14,0)')
      vignette.addColorStop(0.58, 'rgba(3,7,14,0.28)')
      vignette.addColorStop(1, 'rgba(3,7,14,0.84)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, w, h)

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
