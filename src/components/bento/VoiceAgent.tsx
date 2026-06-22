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

function formatCountdown(seconds: number, lang: 'en' | 'id'): string {
  if (seconds <= 0) return lang === 'id' ? 'sebentar lagi…' : 'almost back…'
  if (seconds < 60) {
    return lang === 'id' ? `siap dalam ${seconds}s` : `back in ${seconds}s`
  }
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return lang === 'id' ? `siap dalam ${m}m ${s}s` : `back in ${m}m ${s}s`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return lang === 'id'
    ? `kuota harian habis (${h}j ${m}m lagi)`
    : `daily cap reached (${h}h ${m}m)`
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
