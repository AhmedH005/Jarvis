import { useEffect, useRef } from 'react'
import { useJarvisStore } from '@/store/jarvis'

/**
 * Canvas-based animated background.
 * Renders a slow-drifting grid + floating particles.
 */
export function Background() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const isStreaming = useJarvisStore((s) => s.isStreaming)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let t = 0

    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.5 + 0.3,
      o: Math.random() * 0.3 + 0.05,
    }))

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      t += 0.003

      // Subtle grid
      const gridSize = 60
      const alpha    = 0.025
      ctx.strokeStyle = `rgba(0,212,255,${alpha})`
      ctx.lineWidth   = 0.5
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x + Math.sin(t + x * 0.01) * 2, 0)
        ctx.lineTo(x + Math.sin(t + x * 0.01) * 2, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y + Math.cos(t + y * 0.01) * 2)
        ctx.lineTo(canvas.width, y + Math.cos(t + y * 0.01) * 2)
        ctx.stroke()
      }

      // Particles
      for (const p of particles) {
        p.x += p.vx * (isStreaming ? 2.5 : 1)
        p.y += p.vy * (isStreaming ? 2.5 : 1)
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,212,255,${p.o * (isStreaming ? 1.5 : 1)})`
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [isStreaming])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
