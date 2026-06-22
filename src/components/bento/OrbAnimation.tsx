import { useEffect, useRef, useState } from 'react'

interface OrbAnimationProps {
  state: 'listening' | 'thinking' | 'speaking' | 'disconnected' | 'connecting' | 'initializing' | 'sleeping'
  audioTrack?: MediaStreamTrack
  onConnect?: () => void
}

interface SpherePoint {
  x: number
  y: number
  z: number
  /** Per-particle phase offset so the breath/idle drift doesn't move in lockstep. */
  phase: number
}

interface Palette {
  body: string
  coronaCool: string
  coronaHot: string
  glow: string
  background: string
}

const PARTICLE_COUNT = 169
const TILT_RADIANS = -0.35 // ~20° axis tilt
const ROTATION_SPEED = 0.32 // rad/sec when active, halved when sleeping

/**
 * Spread N points evenly across a unit sphere using the golden-angle
 * Fibonacci lattice. Returns coords in [-1, 1] on every axis.
 */
function generateSpherePoints(n: number): SpherePoint[] {
  const phi = Math.PI * (3 - Math.sqrt(5)) // golden angle
  const out: SpherePoint[] = []
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = phi * i
    out.push({
      x: Math.cos(theta) * r,
      y,
      z: Math.sin(theta) * r,
      phase: (i * 0.137) % (Math.PI * 2)
    })
  }
  return out
}

function paletteFor(state: OrbAnimationProps['state'], connecting: boolean): Palette {
  if (connecting) {
    return {
      body: '#6c4d3e',
      coronaCool: '#8b6a5b',
      coronaHot: '#c8a890',
      glow: 'rgba(200, 170, 150, 0.6)',
      background:
        'linear-gradient(135deg, #f0d8c2 0%, #d4a890 25%, #e8c8b0 50%, #c8a890 75%, #f0d8c2 100%)'
    }
  }
  switch (state) {
    case 'listening':
      return {
        body: '#4a9d8e',
        coronaCool: '#6dbeac',
        coronaHot: '#a5f5dc',
        glow: 'rgba(140,200,180,0.7)',
        background:
          'linear-gradient(135deg, #d8ece4 0%, #6dbeac 25%, #c8e4d8 50%, #80c4b4 75%, #d8ece4 100%)'
      }
    case 'thinking':
      return {
        body: '#4a9d8e',
        coronaCool: '#5fbfa8',
        coronaHot: '#80d4be',
        glow: 'rgba(140,200,180,0.55)',
        background:
          'linear-gradient(135deg, #d8ece4 0%, #6dbeac 25%, #c8e4d8 50%, #80c4b4 75%, #d8ece4 100%)'
      }
    case 'speaking':
      return {
        body: '#5fcfb4',
        coronaCool: '#80d4be',
        coronaHot: '#c0f5e0',
        glow: 'rgba(140,220,190,0.9)',
        background:
          'linear-gradient(135deg, #e0f4ec 0%, #5fcfb4 25%, #d0ecdc 50%, #7eddc4 75%, #e0f4ec 100%)'
      }
    case 'sleeping':
      return {
        body: '#2c4a52',
        coronaCool: '#3a6470',
        coronaHot: '#508295',
        glow: 'rgba(80,130,130,0.4)',
        background:
          'linear-gradient(135deg, #2c4a52 0%, #244853 25%, #2c4a52 50%, #1f3a44 75%, #2c4a52 100%)'
      }
    default:
      // idle / disconnected / error / initializing — the warm pastel I'm
      // attached to.
      return {
        body: '#1e3a5f',
        coronaCool: '#4078a5',
        coronaHot: '#6ba0c8',
        glow: 'rgba(70,120,180,0.55)',
        background:
          'linear-gradient(135deg, #f0e6d2 0%, #a8c9c0 25%, #e8dcc4 50%, #c4d9d4 75%, #f0e6d2 100%)'
      }
  }
}

export default function OrbAnimation({ state, audioTrack, onConnect }: OrbAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sphereRef = useRef<HTMLDivElement>(null)
  const particleEls = useRef<HTMLDivElement[]>([])
  const points = useRef<SpherePoint[]>([])

  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const [isConnecting, setIsConnecting] = useState(false)

  // Mirror live state into refs so the rAF loop sees the latest values
  // without re-running the heavy setup effect.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  const connectingRef = useRef(isConnecting)
  useEffect(() => {
    connectingRef.current = isConnecting
  }, [isConnecting])

  // Reset connecting when state lands in listening/idle/sleeping — keeps the
  // click handler responsive after each turn.
  useEffect(() => {
    if (state !== 'connecting' && state !== 'initializing' && isConnecting) {
      setIsConnecting(false)
    }
  }, [state, isConnecting])

  const handleClick = () => {
    if (!onConnect || isConnecting) return
    setIsConnecting(true)
    onConnect()
  }

  // Audio analyser — same source as before, off the inbound playback track.
  useEffect(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
      analyserRef.current = null
      dataRef.current = null
    }
    if (!audioTrack) return
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const an = ctx.createAnalyser()
    an.fftSize = 64 // give us 32 bins — bass + treble bands fit easily
    const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
    src.connect(an)
    audioCtxRef.current = ctx
    analyserRef.current = an
    dataRef.current = new Uint8Array(an.frequencyBinCount)
    return () => {
      ctx.close().catch(() => {})
    }
  }, [audioTrack])

  // One-shot setup: build the 169 particles, attach to the sphere root.
  useEffect(() => {
    if (!sphereRef.current) return
    const sphere = sphereRef.current
    sphere.innerHTML = ''
    points.current = generateSpherePoints(PARTICLE_COUNT)
    const els: HTMLDivElement[] = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const el = document.createElement('div')
      Object.assign(el.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '8px',
        height: '8px',
        marginLeft: '-4px',
        marginTop: '-4px',
        borderRadius: '50%',
        willChange: 'transform, opacity',
        pointerEvents: 'none',
        transition: 'background 700ms ease-out, box-shadow 700ms ease-out'
      } as Partial<CSSStyleDeclaration>)
      sphere.appendChild(el)
      els.push(el)
    }
    particleEls.current = els
  }, [])

  // The animation loop — runs continuously, reads everything from refs.
  useEffect(() => {
    if (!containerRef.current || !sphereRef.current) return
    const container = containerRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    const startTime = performance.now()

    const loop = () => {
      const els = particleEls.current
      const pts = points.current
      if (!els.length || !pts.length) {
        raf = requestAnimationFrame(loop)
        return
      }

      const elapsedSec = (performance.now() - startTime) / 1000
      const currentState = stateRef.current
      const connecting = connectingRef.current

      // Sample bass + treble bands so the orb can pulse + flare separately.
      let bass = 0
      let treble = 0
      if (analyserRef.current && dataRef.current && currentState === 'speaking') {
        analyserRef.current.getByteFrequencyData(dataRef.current as unknown as Uint8Array<ArrayBuffer>)
        const d = dataRef.current
        const len = d.length
        bass = Math.min(1, (d[0] + d[1] + d[2]) / (3 * 255))
        // Pick mid-treble bins for the corona flare — they correlate well
        // with consonants + breath, which is what feels "alive".
        const tIdx = Math.min(len - 1, 8)
        treble = Math.min(1, (d[tIdx] + d[tIdx + 1] + d[tIdx + 2]) / (3 * 255))
      }

      const palette = paletteFor(currentState, connecting)
      const rect = container.getBoundingClientRect()
      const baseRadius = Math.min(rect.width, rect.height) * 0.33

      // Rotate the whole sphere. Halve speed when sleeping, slower when
      // disconnected (idle), freeze when reduced-motion is on.
      const rotationFactor =
        currentState === 'sleeping'
          ? 0.5
          : currentState === 'disconnected' || currentState === 'initializing'
          ? 0.7
          : 1
      const rotY = reducedMotion ? 0 : elapsedSec * ROTATION_SPEED * rotationFactor
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)
      const cosX = Math.cos(TILT_RADIANS)
      const sinX = Math.sin(TILT_RADIANS)

      // Whole-sphere breath: subtle when idle, deeper when sleeping, none
      // when speaking (bass handles it).
      const breath =
        currentState === 'sleeping'
          ? 0.94 + Math.sin(elapsedSec * 1.6) * 0.04
          : currentState === 'speaking'
          ? 1 + bass * 0.16
          : 1 + Math.sin(elapsedSec * 0.9) * 0.025
      const activeRadius = baseRadius * breath

      // Loading state: jittery shimmer overrides organic motion.
      const shimmerAmp = connecting ? 0.08 + Math.sin(elapsedSec * 14) * 0.04 : 0

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const el = els[i]
        if (!el) continue

        // Rotate around Y
        let x = p.x * cosY - p.z * sinY
        let z = p.x * sinY + p.z * cosY
        let y = p.y
        // Tilt around X
        const ty = y * cosX - z * sinX
        const tz = y * sinX + z * cosX
        y = ty
        z = tz

        // Corona-candidate: front-facing particles near the equator. These
        // are the ones that flare on voice peaks.
        const isCoronaCandidate = z > 0.25 && Math.abs(y) < 0.55
        const flareAmount = isCoronaCandidate ? treble * baseRadius * 0.32 : 0

        // Per-particle idle drift so the surface doesn't feel rigid.
        const drift = reducedMotion ? 0 : Math.sin(elapsedSec * 1.1 + p.phase) * 1.5

        const r = activeRadius + flareAmount + drift + (connecting ? baseRadius * shimmerAmp : 0)
        const screenX = x * r
        const screenY = y * r

        // Depth: z = 1 is front, z = -1 is back.
        const depth = (z + 1) / 2 // [0, 1]
        const scale = 0.4 + depth * 1.1
        const opacity = 0.18 + depth * 0.78
        const brightness = 0.55 + depth * 0.55

        // Color: front-hemisphere bright; corona flare swap when treble spikes.
        let color: string
        if (isCoronaCandidate && treble > 0.35) {
          // Lerp between coronaCool and coronaHot by treble level.
          color = treble > 0.7 ? palette.coronaHot : palette.coronaCool
        } else {
          color = palette.body
        }

        el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) scale(${scale})`
        el.style.opacity = String(opacity)
        el.style.background = color
        const glowSize = 6 + depth * 10 + (isCoronaCandidate ? treble * 8 : 0)
        el.style.boxShadow = `0 0 ${glowSize}px ${palette.glow}`
        el.style.filter = `brightness(${brightness})`
        el.style.zIndex = String(Math.round(depth * 100))
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const palette = paletteFor(state, isConnecting)
  const bgDuration = state === 'sleeping' ? '12s' : state === 'speaking' ? '5s' : '8s'

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className='absolute inset-0 flex items-center justify-center overflow-hidden cursor-pointer'
      style={{
        background: palette.background,
        backgroundSize: '300% 300%',
        animation: `orbGradientShift ${bgDuration} ease-in-out infinite`,
        transition: 'background 800ms ease-out'
      }}
    >
      <style>{`
        @keyframes orbGradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-orb-sphere], [data-orb-bg] {
            animation: none !important;
          }
        }
      `}</style>

      {/* Grainy overlay — pure CSS turbulence, same recipe as the corner orb. */}
      <div
        className='absolute inset-0 opacity-20 pointer-events-none'
        style={{ filter: 'url(#orb-noise)', mixBlendMode: 'overlay' }}
        aria-hidden='true'
      />
      <svg
        aria-hidden='true'
        focusable='false'
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      >
        <filter id='orb-noise'>
          <feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch' />
        </filter>
      </svg>

      {/* The Fibonacci sphere lives in this absolutely-positioned container so
          translate3d coords are relative to its centre. */}
      <div
        ref={sphereRef}
        data-orb-sphere
        className='relative'
        style={{
          width: '100%',
          height: '100%',
          perspective: '600px',
          transformStyle: 'preserve-3d'
        }}
      />
    </div>
  )
}
