import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import type { AgentState } from '@/lib/voice/gemini-live-client'
import { useVoiceStore } from '@/lib/voice/use-voice-store'
import { voiceStore } from '@/lib/voice/voice-store'

import AksaraHint from './AksaraHint'

interface AksaraCornerProps {
  lang?: 'en' | 'id'
}

type Corner = 'tl' | 'tr' | 'bl' | 'br'

const CORNER_STORAGE_KEY = 'aksara_corner_pos_v1'
const DRAG_THRESHOLD_PX = 6

function loadCorner(): Corner {
  if (typeof localStorage === 'undefined') return 'br'
  const v = localStorage.getItem(CORNER_STORAGE_KEY)
  return v === 'tl' || v === 'tr' || v === 'bl' || v === 'br' ? v : 'br'
}

function cornerStyle(c: Corner): CSSProperties {
  const base: CSSProperties = { position: 'fixed', zIndex: 50 }
  const SAFE_X = 'max(env(safe-area-inset-right, 0px), 1rem)'
  const SAFE_Y = 'max(env(safe-area-inset-bottom, 0px), 1rem)'
  const SAFE_X_L = 'max(env(safe-area-inset-left, 0px), 1rem)'
  const SAFE_Y_T = 'max(env(safe-area-inset-top, 0px), 1rem)'
  switch (c) {
    case 'tl':
      return { ...base, top: SAFE_Y_T, left: SAFE_X_L }
    case 'tr':
      return { ...base, top: SAFE_Y_T, right: SAFE_X }
    case 'bl':
      return { ...base, bottom: SAFE_Y, left: SAFE_X_L }
    case 'br':
      return { ...base, bottom: SAFE_Y, right: SAFE_X }
  }
}

function nearestCorner(x: number, y: number): Corner {
  const isLeft = x < window.innerWidth / 2
  const isTop = y < window.innerHeight / 2
  return `${isTop ? 't' : 'b'}${isLeft ? 'l' : 'r'}` as Corner
}

function formatCountdown(seconds: number, lang: 'en' | 'id'): string {
  if (seconds <= 0) return lang === 'id' ? 'sebentar lagi…' : 'almost back…'
  if (seconds < 60) return lang === 'id' ? `siap ${seconds}s` : `back in ${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return lang === 'id' ? `siap ${m}m ${s}s` : `back ${m}m ${s}s`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return lang === 'id' ? `kuota harian (${h}j ${m}m)` : `daily cap (${h}h ${m}m)`
}

function tooltipFor(state: AgentState, lang: 'en' | 'id'): string {
  switch (state) {
    case 'idle':
      return lang === 'id' ? 'klik atau seret' : 'tap or drag me'
    case 'connecting':
      return lang === 'id' ? 'menyambung…' : 'connecting…'
    case 'listening':
      return lang === 'id' ? 'mendengarkan' : 'listening'
    case 'thinking':
      return lang === 'id' ? 'berpikir…' : 'thinking…'
    case 'speaking':
      return lang === 'id' ? 'berbicara' : 'speaking'
    case 'sleeping':
      return lang === 'id' ? 'istirahat sebentar' : 'resting'
    case 'error':
      return lang === 'id' ? 'ada masalah' : 'something went wrong'
  }
}

export default function AksaraCorner({ lang = 'id' }: AksaraCornerProps) {
  const { state, error, track, wakeAt } = useVoiceStore()
  const [now, setNow] = useState(() => Date.now())
  const [showTooltip, setShowTooltip] = useState(false)
  const [pulse, setPulse] = useState(0)

  const [corner, setCorner] = useState<Corner>(() => loadCorner())
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; isDragging: boolean } | null>(null)

  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Track pathname so the corner orb knows to hide itself on home (the bento
  // tile owns the UI there) while keeping the WS alive in the shared store.
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  )
  useEffect(() => {
    const onPageLoad = () => {
      const next = window.location.pathname
      setPathname(next)
      voiceStore.updateContext({ pathname: next })
    }
    document.addEventListener('astro:after-swap', onPageLoad)
    return () => document.removeEventListener('astro:after-swap', onPageLoad)
  }, [])

  useEffect(() => {
    voiceStore.updateContext({ lang })
  }, [lang])

  // Persist corner choice.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(CORNER_STORAGE_KEY, corner)
    } catch {
      /* private mode */
    }
  }, [corner])

  // Countdown tick when sleeping.
  useEffect(() => {
    if (state !== 'sleeping') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state])

  // Amplitude analysis off the playback track for the speaking pulse.
  useEffect(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
      analyserRef.current = null
      dataRef.current = null
    }
    if (!track) return
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const an = ctx.createAnalyser()
    an.fftSize = 32
    const src = ctx.createMediaStreamSource(new MediaStream([track]))
    src.connect(an)
    audioCtxRef.current = ctx
    analyserRef.current = an
    dataRef.current = new Uint8Array(an.frequencyBinCount)
    return () => {
      ctx.close().catch(() => {})
    }
  }, [track])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (analyserRef.current && dataRef.current && state === 'speaking') {
        analyserRef.current.getByteFrequencyData(dataRef.current as unknown as Uint8Array<ArrayBuffer>)
        const avg = dataRef.current.reduce((a, b) => a + b, 0) / dataRef.current.length
        setPulse(Math.min(1, avg / 128))
      } else if (pulse !== 0) {
        setPulse(0)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state, pulse])

  const start = useCallback(() => {
    void voiceStore.start({ lang, pathname })
  }, [lang, pathname])

  const stop = useCallback(() => {
    voiceStore.stop()
  }, [])

  const onActivate =
    state === 'sleeping'
      ? undefined
      : state === 'idle' || state === 'error'
      ? start
      : state === 'connecting'
      ? undefined
      : stop

  /* ---------- drag handling ---------- */
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, isDragging: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      d.isDragging = true
    }
    if (d.isDragging) {
      setDragOffset({ x: dx, y: dy })
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    const wasDragging = d.isDragging
    dragRef.current = null
    if (wasDragging) {
      const next = nearestCorner(e.clientX, e.clientY)
      setCorner(next)
      setDragOffset(null)
      return
    }
    setDragOffset(null)
    onActivate?.()
  }

  const handlePointerCancel = () => {
    dragRef.current = null
    setDragOffset(null)
  }

  /* ---------- visuals ---------- */
  // Mirrors the OrbAnimation palette so the morph between tile and corner
  // stays in the same hue family.
  const gradients: Record<AgentState, { bg: string; glow: string; grain: number }> = {
    idle: {
      bg: 'linear-gradient(135deg, #f0e6d2 0%, #a8c9c0 25%, #e8dcc4 50%, #c4d9d4 75%, #f0e6d2 100%)',
      glow: 'rgba(140, 180, 175, 0.45)',
      grain: 0.16
    },
    connecting: {
      bg: 'linear-gradient(135deg, #f0d8c2 0%, #d4a890 25%, #e8c8b0 50%, #c8a890 75%, #f0d8c2 100%)',
      glow: 'rgba(200, 170, 140, 0.55)',
      grain: 0.16
    },
    listening: {
      bg: 'linear-gradient(135deg, #d8e8ec 0%, #5fbedc 25%, #c8dee8 50%, #80b4cf 75%, #d8e8ec 100%)',
      glow: 'rgba(110, 195, 235, 0.6)',
      grain: 0.16
    },
    thinking: {
      bg: 'linear-gradient(135deg, #d8e8ec 0%, #5fbedc 25%, #c8dee8 50%, #80b4cf 75%, #d8e8ec 100%)',
      glow: 'rgba(110, 195, 235, 0.5)',
      grain: 0.18
    },
    speaking: {
      bg: 'linear-gradient(135deg, #e0f0f4 0%, #5fcfdc 25%, #d0e4ec 50%, #7ec4dc 75%, #e0f0f4 100%)',
      glow: 'rgba(110, 215, 235, 0.85)',
      grain: 0.14
    },
    sleeping: {
      bg: 'linear-gradient(135deg, #2c4852 0%, #244853 25%, #2c4852 50%, #1f3a44 75%, #2c4852 100%)',
      glow: 'rgba(95, 155, 185, 0.4)',
      grain: 0.22
    },
    error: {
      bg: 'linear-gradient(135deg, #f0d2d2 0%, #c89090 25%, #e8c4c4 50%, #c8a4a4 75%, #f0d2d2 100%)',
      glow: 'rgba(200, 140, 140, 0.5)',
      grain: 0.18
    }
  }
  const g = gradients[state]
  const baseScale = state === 'sleeping' ? 0.94 : 1
  const isDragging = dragOffset !== null
  const scale = baseScale + pulse * 0.18 + (isDragging ? 0.06 : 0)
  const countdownSeconds = wakeAt ? Math.max(0, Math.ceil((wakeAt - now) / 1000)) : 0
  const gradientDuration = state === 'sleeping' ? '6s' : state === 'speaking' ? '4s' : '8s'

  // Home pages already show the bento-tile orb; the corner orb hides itself
  // there but stays MOUNTED so the WS in the store keeps running.
  const isHome = pathname === '/' || pathname === '/id/' || pathname === '/id'
  if (isHome) return null

  const isTop = corner === 'tl' || corner === 'tr'
  const isLeft = corner === 'tl' || corner === 'bl'

  return (
    <div
      style={{
        ...cornerStyle(corner),
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: isTop ? 'column-reverse' : 'column',
        alignItems: isLeft ? 'flex-start' : 'flex-end',
        gap: '0.5rem'
      }}
    >
      {state === 'sleeping' && (
        <div
          style={{
            background: 'rgba(0,0,0,0.55)',
            color: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.12)',
            padding: '0.25rem 0.7rem',
            borderRadius: 999,
            fontSize: 11,
            pointerEvents: 'none'
          }}
        >
          {formatCountdown(countdownSeconds, lang)}
        </div>
      )}

      <button
        type='button'
        aria-label={`Aksara — ${tooltipFor(state, lang)}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        disabled={!onActivate && !isDragging}
        style={{
          pointerEvents: 'auto',
          width: 60,
          height: 60,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.18)',
          padding: 0,
          cursor: isDragging ? 'grabbing' : onActivate ? 'grab' : 'default',
          touchAction: 'none',
          background: g.bg,
          backgroundSize: '300% 300%',
          animation: `aksaraCornerShift ${gradientDuration} ease-in-out infinite`,
          boxShadow: isDragging
            ? `0 12px 30px ${g.glow}, inset 0 1px 2px rgba(255,255,255,0.3)`
            : `0 6px 22px ${g.glow}, inset 0 1px 2px rgba(255,255,255,0.25)`,
          transform: isDragging
            ? `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(${scale})`
            : `scale(${scale})`,
          transition: isDragging
            ? 'background 600ms ease-out, box-shadow 200ms ease-out'
            : 'transform 280ms cubic-bezier(.22,1,.36,1), background 600ms ease-out, box-shadow 600ms ease-out',
          position: 'relative',
          overflow: 'hidden',
          willChange: 'transform',
          // Shared transition name with the bento tile — astro view transitions
          // animate the size + position + shape morph across nav for free.
          viewTransitionName: 'aksara-shell'
        }}
      >
        <span
          aria-hidden='true'
          style={{
            position: 'absolute',
            inset: 0,
            opacity: g.grain,
            pointerEvents: 'none',
            filter: 'url(#aksara-corner-grain)',
            mixBlendMode: 'overlay'
          }}
        />
        <svg aria-hidden='true' style={{ position: 'absolute', width: 0, height: 0 }}>
          <filter id='aksara-corner-grain'>
            <feTurbulence
              type='fractalNoise'
              baseFrequency='0.9'
              numOctaves='2'
              stitchTiles='stitch'
            />
          </filter>
        </svg>
        <span
          aria-hidden='true'
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 45%)'
          }}
        />
      </button>

      {showTooltip && !isDragging && (
        <div
          style={{
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '0.2rem 0.5rem',
            borderRadius: 6,
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {tooltipFor(state, lang)}
          {error && state !== 'sleeping' && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>· {error.kind}</span>
          )}
        </div>
      )}

      <style>{`
        @keyframes aksaraCornerShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          button[aria-label^='Aksara'] {
            animation: none !important;
          }
        }
      `}</style>

      <AksaraHint lang={lang} active={state === 'idle'} corner={corner} />
    </div>
  )
}
