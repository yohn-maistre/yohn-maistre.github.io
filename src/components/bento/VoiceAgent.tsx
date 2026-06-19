import { useCallback, useEffect, useRef, useState } from 'react'

import { GeminiLiveClient, type AgentState } from '@/lib/voice/gemini-live-client'

import OrbAnimation from './OrbAnimation'

type OrbState = React.ComponentProps<typeof OrbAnimation>['state']

const stateToOrb: Record<AgentState, OrbState> = {
  idle: 'disconnected',
  connecting: 'connecting',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  error: 'disconnected',
}

export default function VoiceAgent() {
  const [state, setState] = useState<AgentState>('idle')
  const [track, setTrack] = useState<MediaStreamTrack | undefined>()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const clientRef = useRef<GeminiLiveClient | null>(null)

  const start = useCallback(async () => {
    if (clientRef.current) return
    setErrorMsg(null)
    const endpoint = import.meta.env.PUBLIC_TOKEN_ENDPOINT
    console.log('[voice-agent] start, endpoint =', endpoint)
    if (!endpoint) {
      setErrorMsg('Token endpoint not configured at build time.')
      return
    }
    const client = new GeminiLiveClient({
      onState: (s) => {
        console.log('[voice-agent] state →', s)
        setState(s)
      },
      onPlaybackTrack: setTrack,
      onError: (e) => {
        console.error('[voice-agent] error:', e)
        setErrorMsg(e.message)
      },
    })
    clientRef.current = client
    try {
      await client.connect()
    } catch {
      clientRef.current = null
    }
  }, [])

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
  const phase: 'idle' | 'active' = state === 'idle' || state === 'error' ? 'idle' : 'active'
  const onClick = phase === 'idle' ? start : state === 'connecting' ? undefined : stop

  return (
    <div
      className='relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-secondary/25'
      style={{ containerType: 'size' }}
    >
      <div className='relative flex h-full w-full items-center justify-center'>
        <OrbAnimation
          key={phase}
          state={stateToOrb[state]}
          audioTrack={track}
          onConnect={onClick}
        />
      </div>
      {errorMsg && (
        <div className='pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-black/70 px-2 py-1 text-center text-[10px] text-white'>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
