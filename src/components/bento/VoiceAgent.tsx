import { useCallback, useEffect } from 'react'

import type { AgentError, AgentState } from '@/lib/voice/gemini-live-client'
import { useVoiceStore } from '@/lib/voice/use-voice-store'
import { voiceStore } from '@/lib/voice/voice-store'

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

/** Clock-style countdown for the prominent sleeping overlay (MM:SS or H:MM:SS). */
function formatCooldownClock(seconds: number): string {
  if (seconds <= 0) return '0:00'
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${m.toString().padStart(2, '0')}:00`
}

function errorCopy(err: AgentError, lang: 'en' | 'id'): string {
  if (err.kind === 'mic-denied') {
    return lang === 'id' ? 'butuh izin mikrofon ya' : 'mic permission needed'
  }
  if (err.kind === 'rate-limit' || err.kind === 'quota') {
    return err.message
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
  const { state, error, track, wakeAt } = useVoiceStore()

  // Push current locale into the live client whenever the prop changes.
  // The store handles the pathname-on-nav side via AksaraCorner's listener;
  // the bento only ever lives on home, so we don't need to track route here.
  useEffect(() => {
    voiceStore.updateContext({ lang })
  }, [lang])

  const start = useCallback(() => {
    void voiceStore.start({
      lang,
      pathname: typeof window !== 'undefined' ? window.location.pathname : '/'
    })
  }, [lang])

  const stop = useCallback(() => {
    voiceStore.stop()
  }, [])

  const onOrbClick =
    state === 'sleeping'
      ? undefined
      : state === 'idle' || state === 'error'
      ? start
      : state === 'connecting'
      ? undefined
      : stop

  const remainingSeconds = wakeAt ? Math.max(0, Math.ceil((wakeAt - Date.now()) / 1000)) : 0

  return (
    <div className='relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-secondary/25'>
      <div className='relative flex h-full w-full items-center justify-center'>
        <OrbAnimation
          state={stateToOrb[state]}
          audioTrack={track}
          onConnect={onOrbClick}
        />
      </div>

      {state === 'sleeping' && (
        <div
          className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-3xl backdrop-blur-[2px]'
          style={{
            background:
              'radial-gradient(circle at center, rgba(60, 130, 185, 0.42) 0%, rgba(40, 90, 140, 0.55) 75%)',
            animation: 'aksaraSleepFade 600ms ease-out'
          }}
        >
          <div
            className='text-white/90 text-[10px] font-medium uppercase tracking-[0.18em] mb-1.5'
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {lang === 'id' ? 'ngaso bentar' : 'cooling down'}
          </div>
          <div
            className='text-white text-[2rem] font-light tabular-nums tracking-wider leading-none'
            style={{
              textShadow:
                '0 0 14px rgba(140, 200, 240, 0.65), 0 2px 6px rgba(0,0,0,0.45)'
            }}
          >
            {formatCooldownClock(remainingSeconds)}
          </div>
          <div
            className='text-white/75 text-[10px] mt-2 max-w-[80%] text-center leading-snug'
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
          >
            {remainingSeconds >= 3600
              ? lang === 'id'
                ? 'kuota harian browser ini habis'
                : "this browser's daily cap is spent"
              : lang === 'id'
              ? 'klik lagi pas siap'
              : 'click again when ready'}
          </div>
          <style>{`
            @keyframes aksaraSleepFade {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
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
