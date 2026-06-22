import { useCallback, useEffect, useRef, useState } from 'react'

import {
  GeminiLiveClient,
  type AgentError,
  type AgentState
} from '@/lib/voice/gemini-live-client'
import {
  playConnectChime,
  playDisconnectChime,
  playErrorChime
} from '@/lib/voice/chimes'

import AksaraHint from './AksaraHint'

interface AksaraCornerProps {
  lang?: 'en' | 'id'
}

const ERROR_BURST_WINDOW_MS = 60_000

function formatCountdown(seconds: number, lang: 'en' | 'id'): string {
  if (seconds <= 0) return lang === 'id' ? 'sebentar lagi…' : 'almost back…'
  if (seconds < 60) return lang === 'id' ? `siap ${seconds}s` : `back in ${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return lang === 'id' ? `siap ${m}m ${s}s` : `back ${m}m ${s}s`
}

function tooltipFor(state: AgentState, lang: 'en' | 'id'): string {
  switch (state) {
    case 'idle':
      return lang === 'id' ? 'klik buat ngobrol' : 'tap to chat'
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
  const [state, setState] = useState<AgentState>('idle')
  const [error, setError] = useState<AgentError | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [showTooltip, setShowTooltip] = useState(false)
  const [pulse, setPulse] = useState(0)
  const clientRef = useRef<GeminiLiveClient | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recentErrorsRef = useRef<Array<{ kind: string; at: number }>>([])
  const wakeAtRef = useRef<number | null>(null)
  const prevStateRef = useRef<AgentState>('idle')

  // Track pathname for the tool dispatcher.
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  )
  useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname)
    document.addEventListener('astro:after-swap', onPageLoad)
    return () => document.removeEventListener('astro:after-swap', onPageLoad)
  }, [])

  // Push lang+pathname into the live client whenever they change.
  useEffect(() => {
    clientRef.current?.updateContext({ lang, pathname })
  }, [lang, pathname])

  // Countdown tick.
  useEffect(() => {
    if (state !== 'sleeping') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state])

  useEffect(() => {
    if (state !== 'sleeping') return
    const wakeAt = wakeAtRef.current
    if (wakeAt && Date.now() >= wakeAt) {
      wakeAtRef.current = null
      setError(null)
      setState('idle')
    }
  }, [state, now])

  // Chimes.
  useEffect(() => {
    const prev = prevStateRef.current
    if (prev !== state) {
      if (prev === 'idle' && state === 'listening') playConnectChime()
      if (
        (prev === 'listening' || prev === 'speaking' || prev === 'thinking') &&
        state === 'idle'
      ) {
        playDisconnectChime()
      }
      if (state === 'sleeping' || state === 'error') playErrorChime()
      prevStateRef.current = state
    }
  }, [state])

  // Amplitude analysis off the playback track for the speaking pulse.
  const handleTrack = useCallback((track: MediaStreamTrack | undefined) => {
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
  }, [])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (analyserRef.current && dataRef.current && state === 'speaking') {
        // Cast around the recently-tightened TS dom types for AnalyserNode.
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

  const start = useCallback(async () => {
    if (clientRef.current) return
    if (state === 'sleeping') return
    if (!import.meta.env.PUBLIC_TOKEN_ENDPOINT) return
    setError(null)
    const client = new GeminiLiveClient({
      onState: setState,
      onPlaybackTrack: handleTrack,
      onError: (e) => {
        console.error('[aksara-corner]', e.kind, e.message)
        setError(e)
        const cutoff = Date.now() - ERROR_BURST_WINDOW_MS
        recentErrorsRef.current = recentErrorsRef.current.filter((r) => r.at >= cutoff)
        recentErrorsRef.current.push({ kind: e.kind, at: Date.now() })
        const sameKindBurst = recentErrorsRef.current.filter((r) => r.kind === e.kind).length
        const baseDelay = (e.retryAfter ?? 60) * 1000
        const burst = Math.min(2 ** Math.max(0, sameKindBurst - 1), 32)
        const sleepFor = Math.min(baseDelay * burst, 10 * 60_000)
        if (e.kind === 'rate-limit' || e.kind === 'quota') {
          wakeAtRef.current = Date.now() + sleepFor
        }
      },
      lang,
      pathname
    })
    clientRef.current = client
    try {
      await client.connect()
    } catch {
      clientRef.current = null
    }
  }, [lang, pathname, state, handleTrack])

  const stop = useCallback(() => {
    clientRef.current?.disconnect()
    clientRef.current = null
  }, [])

  useEffect(
    () => () => {
      clientRef.current?.disconnect()
      clientRef.current = null
      audioCtxRef.current?.close().catch(() => {})
    },
    []
  )

  const onClick =
    state === 'sleeping'
      ? undefined
      : state === 'idle' || state === 'error'
      ? start
      : state === 'connecting'
      ? undefined
      : stop

  // Visual color per state.
  const colors: Record<AgentState, { from: string; to: string; glow: string }> = {
    idle: { from: '#1e3a5f', to: '#244e6e', glow: 'rgba(70,120,180,0.55)' },
    connecting: { from: '#533c32', to: '#6c4d3e', glow: 'rgba(200,170,150,0.55)' },
    listening: { from: '#4a9d8e', to: '#5fbfa8', glow: 'rgba(140,200,180,0.7)' },
    thinking: { from: '#4a9d8e', to: '#5fbfa8', glow: 'rgba(140,200,180,0.7)' },
    speaking: { from: '#4a9d8e', to: '#7ed7c0', glow: 'rgba(140,200,180,0.85)' },
    sleeping: { from: '#243845', to: '#2c4a52', glow: 'rgba(80,130,130,0.45)' },
    error: { from: '#5a2c2c', to: '#6e3a3a', glow: 'rgba(200,120,120,0.55)' }
  }
  const c = colors[state]
  const scale = 1 + pulse * 0.18
  const wakeAt = wakeAtRef.current
  const countdownSeconds = wakeAt ? Math.max(0, Math.ceil((wakeAt - now) / 1000)) : 0

  return (
    <div
      style={{
        position: 'fixed',
        right: 'max(env(safe-area-inset-right, 0px), 1rem)',
        bottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
        zIndex: 50,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
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
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        disabled={!onClick}
        style={{
          pointerEvents: 'auto',
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          padding: 0,
          cursor: onClick ? 'pointer' : 'default',
          background: `radial-gradient(circle at 30% 30%, ${c.to} 0%, ${c.from} 75%)`,
          boxShadow: `0 4px 14px ${c.glow}, inset 0 1px 2px rgba(255,255,255,0.2)`,
          transform: `scale(${scale})`,
          transition: 'transform 90ms linear, background 400ms ease-out, box-shadow 400ms ease-out',
          position: 'relative',
          overflow: 'hidden',
          filter: 'url(#aksara-corner-goo)'
        }}
      >
        <svg width='0' height='0' style={{ position: 'absolute' }}>
          <filter id='aksara-corner-goo'>
            <feGaussianBlur in='SourceGraphic' stdDeviation='2' result='b' />
            <feColorMatrix
              in='b'
              type='matrix'
              values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9'
              result='g'
            />
            <feBlend in='SourceGraphic' in2='g' />
          </filter>
        </svg>
        <span
          aria-hidden='true'
          style={{
            position: 'absolute',
            inset: 0,
            opacity: state === 'speaking' ? 0.85 : 0.5,
            background:
              'radial-gradient(circle at 70% 70%, rgba(255,255,255,0.35) 0%, transparent 35%)'
          }}
        />
        {state === 'sleeping' && (
          <span
            aria-hidden='true'
            data-aksara-zzz
            style={{
              position: 'absolute',
              right: 8,
              top: 4,
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(220,240,240,0.9)',
              fontFamily: 'system-ui'
            }}
          >
            z
          </span>
        )}
      </button>

      {showTooltip && (
        <div
          style={{
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '0.2rem 0.5rem',
            borderRadius: 6,
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            position: 'absolute',
            right: '70px',
            bottom: '8px'
          }}
        >
          {tooltipFor(state, lang)}
          {error && state !== 'sleeping' && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>· {error.kind}</span>
          )}
        </div>
      )}

      <style>{`
        @keyframes aksaraCornerBreath {
          0%, 100% { filter: brightness(0.9); }
          50% { filter: brightness(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-aksara-zzz] { display: none !important; }
        }
      `}</style>

      <AksaraHint lang={lang} active={state === 'idle'} />
    </div>
  )
}
