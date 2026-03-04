'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useReducedMotion, useIsMobile } from '@/lib/hooks'

/* ── constants ─────────────────────────────────── */

const PARTICLE_COUNT_DESKTOP = 150
const PARTICLE_COUNT_MOBILE = 80
const CLUSTER_RADIUS = 90
const BREATH_SPEED = 0.026 // ~4 s cycle at 60 fps
const BREATH_AMPLITUDE = 0.12
const CONNECTION_DISTANCE = 55

const COPPER = ['#C45D3E', '#D4724E', '#B85636'] as const
const GOLDEN = ['#E8A87C', '#F0C098'] as const

/* ── types ─────────────────────────────────────── */

type Phase = 'contribute' | 'cluster' | 'return' | 'fading'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  phase: Phase
  age: number
  maxAge: number
  radius: number
  color: string
  opacity: number
  wobbleOffset: number
}

/* ── helpers ───────────────────────────────────── */

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/* ── particle factory ─────────────────────────── */

function createParticle(w: number, h: number): Particle {
  const cx = w / 2
  const cy = h / 2

  // spawn at random edge
  const edge = Math.random()
  let x: number, y: number
  if (edge < 0.25) { x = 0; y = Math.random() * h }
  else if (edge < 0.5) { x = w; y = Math.random() * h }
  else if (edge < 0.75) { x = Math.random() * w; y = 0 }
  else { x = Math.random() * w; y = h }

  const angle = Math.atan2(cy - y, cx - x)
  const speed = 0.3 + Math.random() * 0.5

  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    phase: 'contribute',
    age: 0,
    maxAge: 200 + Math.random() * 300,
    radius: 2 + Math.random() * 2,
    color: pick(COPPER),
    opacity: 0,
    wobbleOffset: Math.random() * Math.PI * 2,
  }
}

/* ── per-frame update ─────────────────────────── */

function updateParticle(p: Particle, w: number, h: number, breathPhase: number): void {
  const cx = w / 2
  const cy = h / 2
  p.age++

  switch (p.phase) {
    case 'contribute': {
      // fade in
      p.opacity = Math.min(p.opacity + 0.02, 0.85)
      // sinusoidal wobble perpendicular to travel direction
      const wobble = Math.sin(p.age * 0.04 + p.wobbleOffset) * 0.4
      const angle = Math.atan2(cy - p.y, cx - p.x)
      p.x += Math.cos(angle) * 0.5 + Math.cos(angle + Math.PI / 2) * wobble
      p.y += Math.sin(angle) * 0.5 + Math.sin(angle + Math.PI / 2) * wobble

      const dist = Math.hypot(cx - p.x, cy - p.y)
      if (dist < CLUSTER_RADIUS) {
        p.phase = 'cluster'
        p.age = 0
        p.maxAge = 120 + Math.random() * 180
      }
      break
    }

    case 'cluster': {
      // orbit center with breathing
      const breathScale = 1 + Math.sin(breathPhase) * BREATH_AMPLITUDE
      const orbitAngle = Math.atan2(p.y - cy, p.x - cx) + 0.008
      const currentDist = Math.hypot(p.x - cx, p.y - cy)
      const targetDist = lerp(currentDist, CLUSTER_RADIUS * 0.6 * breathScale, 0.02)
      p.x = cx + Math.cos(orbitAngle) * targetDist
      p.y = cy + Math.sin(orbitAngle) * targetDist
      p.opacity = 0.7 + Math.sin(breathPhase) * 0.15

      if (p.age > p.maxAge) {
        p.phase = 'return'
        p.color = pick(GOLDEN)
        p.age = 0
        p.maxAge = 150 + Math.random() * 200
        const outAngle = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - 0.5) * 1.2
        p.vx = Math.cos(outAngle) * (0.8 + Math.random() * 0.6)
        p.vy = Math.sin(outAngle) * (0.8 + Math.random() * 0.6)
      }
      break
    }

    case 'return': {
      p.x += p.vx
      p.y += p.vy
      p.opacity = Math.max(0, 0.85 - p.age / p.maxAge)

      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20 || p.age > p.maxAge) {
        p.phase = 'fading'
        p.age = 0
        p.maxAge = 30
      }
      break
    }

    case 'fading': {
      p.opacity = Math.max(0, 1 - p.age / 30)
      if (p.age >= 30) {
        // recycle in-place
        const fresh = createParticle(w, h)
        Object.assign(p, fresh)
      }
      break
    }
  }
}

/* ── draw helpers ──────────────────────────────── */

function drawClusterGlow(ctx: CanvasRenderingContext2D, w: number, h: number, breathPhase: number): void {
  const cx = w / 2
  const cy = h / 2
  const r = CLUSTER_RADIUS * (1 + Math.sin(breathPhase) * BREATH_AMPLITUDE) * 1.6
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  grad.addColorStop(0, 'rgba(196,93,62,0.12)')
  grad.addColorStop(1, 'rgba(196,93,62,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  if (p.opacity <= 0) return
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius)
  grad.addColorStop(0, withAlpha(p.color, p.opacity))
  grad.addColorStop(1, withAlpha(p.color, 0))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
  ctx.fill()
}

function drawConnections(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  const len = particles.length
  ctx.lineWidth = 0.5
  for (let i = 0; i < len; i++) {
    const a = particles[i]
    if (a.opacity < 0.2) continue
    for (let j = i + 1; j < len; j++) {
      const b = particles[j]
      if (b.opacity < 0.2) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = dx * dx + dy * dy // skip sqrt, compare squared
      if (dist < CONNECTION_DISTANCE * CONNECTION_DISTANCE) {
        const alpha = 0.08 * Math.min(a.opacity, b.opacity)
        ctx.strokeStyle = withAlpha('#C45D3E', alpha)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }
}

function drawStaticScene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h / 2

  // static glow
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, CLUSTER_RADIUS * 1.6)
  grad.addColorStop(0, 'rgba(196,93,62,0.10)')
  grad.addColorStop(1, 'rgba(196,93,62,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, CLUSTER_RADIUS * 1.6, 0, Math.PI * 2)
  ctx.fill()

  // scatter frozen dots
  const rng = (seed: number) => {
    let s = seed
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
  }
  const rand = rng(42)
  const count = 60
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2
    const dist = rand() * Math.min(w, h) * 0.42
    const x = cx + Math.cos(angle) * dist
    const y = cy + Math.sin(angle) * dist
    const r = 1.5 + rand() * 2
    const color = rand() > 0.3 ? pick(COPPER) : pick(GOLDEN)
    const dotGrad = ctx.createRadialGradient(x, y, 0, x, y, r)
    dotGrad.addColorStop(0, withAlpha(color, 0.6))
    dotGrad.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = dotGrad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ── component ─────────────────────────────────── */

export function PollenCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const breathRef = useRef(0)

  const reducedMotion = useReducedMotion()
  const isMobile = useIsMobile()

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    breathRef.current += BREATH_SPEED
    const breathPhase = breathRef.current

    // 1. cluster glow
    drawClusterGlow(ctx, w, h, breathPhase)

    // 2. update + draw particles
    const particles = particlesRef.current
    for (const p of particles) {
      updateParticle(p, w, h, breathPhase)
      drawParticle(ctx, p)
    }

    // 3. connections (skip on mobile)
    if (!isMobile) {
      drawConnections(ctx, particles)
    }

    animationRef.current = requestAnimationFrame(draw)
  }, [isMobile])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement!)
    resize()

    if (reducedMotion) {
      // draw once, static
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const dpr = window.devicePixelRatio || 1
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawStaticScene(ctx, canvas.width / dpr, canvas.height / dpr)
      }
      return () => observer.disconnect()
    }

    // initialize particles
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const count = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP
    particlesRef.current = Array.from({ length: count }, () => {
      const p = createParticle(w, h)
      // stagger initial positions so they don't all start at edges
      const cx = w / 2, cy = h / 2
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * Math.min(w, h) * 0.45
      p.x = cx + Math.cos(angle) * dist
      p.y = cy + Math.sin(angle) * dist
      p.opacity = 0.3 + Math.random() * 0.4
      // randomize starting phase
      const r = Math.random()
      if (r < 0.4) p.phase = 'contribute'
      else if (r < 0.75) p.phase = 'cluster'
      else { p.phase = 'return'; p.color = pick(GOLDEN) }
      return p
    })

    animationRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animationRef.current)
      observer.disconnect()
    }
  }, [reducedMotion, isMobile, draw])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
      }}
    />
  )
}
