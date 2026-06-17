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
  const clientRef = useRef<GeminiLiveClient | null>(null)

  const start = useCallback(async () => {
    if (clientRef.current) return
    if (!import.meta.env.PUBLIC_TOKEN_ENDPOINT) {
      alert('Voice agent is offline (token endpoint not configured).')
      return
    }
    const client = new GeminiLiveClient({
      onState: setState,
      onPlaybackTrack: setTrack,
      onError: (e) => console.error('[voice-agent]', e),
    })
    clientRef.current = client
    try {
      await client.connect()
    } catch {
      clientRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      clientRef.current?.disconnect()
      clientRef.current = null
    },
    []
  )

  return (
    <div className='flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-secondary/25'>
      <div className='relative flex h-full w-full items-center justify-center'>
        <OrbAnimation
          state={stateToOrb[state]}
          audioTrack={track}
          onConnect={state === 'idle' ? start : undefined}
        />
      </div>
    </div>
  )
}
