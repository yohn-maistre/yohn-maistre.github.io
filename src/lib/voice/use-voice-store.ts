import { useSyncExternalStore } from 'react'

import { voiceStore, type Snapshot } from './voice-store'

/**
 * useSyncExternalStore needs a STABLE reference for the server snapshot —
 * returning a fresh object on every call would trip the same "snapshot
 * keeps changing" detection that nuked the components last round.
 */
const SSR_SNAPSHOT: Snapshot = {
  state: 'idle',
  error: null,
  track: undefined,
  wakeAt: null,
  isActive: false
}

const subscribe = (fn: () => void): (() => void) => voiceStore.subscribe(fn)
const getSnapshot = (): Snapshot => voiceStore.getSnapshot()
const getServerSnapshot = (): Snapshot => SSR_SNAPSHOT

/**
 * React hook that subscribes to the module-level voice store. Both
 * <VoiceAgent> (bento tile) and <AksaraCorner> (corner orb) use this so
 * they always agree on the live state.
 *
 * useSyncExternalStore is the right primitive here: it's built for this
 * exact pattern of subscribing to a value that lives outside React.
 */
export function useVoiceStore(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
