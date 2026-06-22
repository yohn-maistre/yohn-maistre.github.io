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

import OrbAnimation from './OrbAnimation'

type OrbState = React.ComponentProps<typeof OrbAnimation>['state']

const stateToOrb: Record<AgentState, OrbState> = {
  idle: 'disconnected',
  connecting: 'connecting',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  sleeping: 'sleeping',
  error: 'disconnected'
}

interface VoiceAgentProps {
  lang?: 'en' | 'id'
}

// Same-kind error bursts within this window scale the sleep delay.
const ERROR_BURST_WINDOW_MS = 60_000

function formatCountdown(seconds: number, lang: 'en' | 'id'): string {
  if (seconds <= 0) return lang === 'id' ? 'sebentar lagi…' : 'almost back…'
  if (seconds < 60) {
    return lang === 'id' ? `siap dalam ${seconds}s` : `back in ${seconds}s`
  }
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return lang === 'id' ? `siap dalam ${m}m ${s}s` : `back in ${m}m ${s}s`
}

function errorCopy(err: AgentError, lang: 'en' | 'id'): string {
  if (err.kind === 'mic-denied') {
    return lang === 'id' ? 'butuh izin mikrofon ya' : 'mic permission needed'
  }
  if (err.kind === 'rate-limit' || err.kind === 'quota') {
    return lang === 'id' ? 'Aksara lagi istirahat sebentar 😴' : 'Aksara is resting for a moment 😴'
  }
  if (err.kind === 'auth') {
    return lang === 'id' ? 'tidak bisa otentikasi' : 'auth failed'
  }
  if (err.kind === 'network') {
    return lang === 'id' ? 'jaringan bermasalah' : 'network hiccup'
  }
  return lang === 'id' ? 'ada yang salah, coba lagi' : 'something went wrong'
}

export default function VoiceAgent({ lang = 'id' }: VoiceAgentProps) {
  const [state, setState] = useState<AgentState>('idle')
  const [track, setTrack] = useState<MediaStreamTrack | undefined>()
  const [error, setError] = useState<AgentError | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const clientRef = useRef<GeminiLiveClient | null>(null)
  const recentErrorsRef = useRef<Array<{ kind: string; at: number }>>([])
  const wakeAtRef = useRef<number | null>(null)
  const prevStateRef = useRef<AgentState>('idle')

  // Tick clock once a second while sleeping.
  useEffect(() => {
    if (state !== 'sleeping' && wakeAtRef.current === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state])

  // Auto-wake when the cooldown elapses.
  useEffect(() => {
    if (state !== 'sleeping') return
    const wakeAt = wakeAtRef.current
    if (!wakeAt) return
    if (Date.now() >= wakeAt) {
      wakeAtRef.current = null
      setError(null)
      setState('idle')
    }
  }, [state, now])

  // Chimes on state transition.
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

  const start = useCallback(async () => {
    if (clientRef.current) return
    if (state === 'sleeping') return
    setError(null)
    const endpoint = import.meta.env.PUBLIC_TOKEN_ENDPOINT
    console.log('[voice-agent] start, endpoint =', endpoint)
    if (!endpoint) {
      setError({ kind: 'auth', message: 'Token endpoint not configured at build time.' })
      return
    }
    const client = new GeminiLiveClient({
      onState: (s) => {
        console.log('[voice-agent] state →', s)
        setState(s)
      },
      onPlaybackTrack: setTrack,
      onError: (e) => {
        console.error('[voice-agent]', e.kind, e.message, 'retryAfter=', e.retryAfter)
        setError(e)
        const cutoff = Date.now() - ERROR_BURST_WINDOW_MS
        recentErrorsRef.current = recentErrorsRef.current.filter((r) => r.at >= cutoff)
        recentErrorsRef.current.push({ kind: e.kind, at: Date.now() })

        const sameKindBurst = recentErrorsRef.current.filter((r) => r.kind === e.kind).length
        const baseDelay = (e.retryAfter ?? 60) * 1000
        const burstMultiplier = Math.min(2 ** Math.max(0, sameKindBurst - 1), 32)
        const sleepFor = Math.min(baseDelay * burstMultiplier, 10 * 60_000)
        if (e.kind === 'rate-limit' || e.kind === 'quota') {
          wakeAtRef.current = Date.now() + sleepFor
        }
      },
      lang
    })
    clientRef.current = client
    try {
      await client.connect()
    } catch {
      clientRef.current = null
    }
  }, [lang, state])

  const stop = useCallback(() => {
    console.log('[voice-agent] stop')
    clientRef.current?.disconnect()
    clientRef.current = null
  }, [])

  useEffect(
    () => () => {
      clientRef.current?.disconnect()
      clientRef.current = null
    },
    []
  )

  // OrbAnimation owns an internal `isConnecting` flag that latches on click
  // and never resets. Remount it on each idle ↔ active transition so the
  // flag is naturally reborn at `false` and the click handler can fire again
  // (now wired to `stop` so the orb itself is the hang-up button).
  const phase: 'idle' | 'active' | 'asleep' =
    state === 'sleeping' ? 'asleep' : state === 'idle' || state === 'error' ? 'idle' : 'active'
  const onOrbClick = phase === 'idle' ? start : state === 'connecting' ? undefined : stop

  const showCountdown = state === 'sleeping' && wakeAtRef.current
  const remainingSeconds = showCountdown
    ? Math.max(0, Math.ceil(((wakeAtRef.current as number) - now) / 1000))
    : 0

  return (
    <div className='relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-secondary/25'>
      <div className='relative flex h-full w-full items-center justify-center'>
        <OrbAnimation
          key={phase}
          state={stateToOrb[state]}
          audioTrack={track}
          onConnect={onOrbClick}
        />
      </div>

      {state === 'sleeping' && (
        <div className='pointer-events-none absolute bottom-2 left-2 right-2 flex justify-center'>
          <div className='rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm'>
            {formatCountdown(remainingSeconds, lang)}
          </div>
        </div>
      )}

      {error && state !== 'sleeping' && (
        <div className='pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-black/70 px-2 py-1 text-center text-[10px] text-white'>
          {errorCopy(error, lang)}
        </div>
      )}
    </div>
  )
}
