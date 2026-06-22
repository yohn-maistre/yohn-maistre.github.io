import { useSyncExternalStore } from 'react'

import { voiceStore, type Snapshot } from './voice-store'

/**
 * React hook that subscribes to the module-level voice store. Both
 * <VoiceAgent> (bento tile) and <AksaraCorner> (corner orb) use this so
 * they always agree on the live state.
 *
 * useSyncExternalStore is the right primitive here: it's built for this
 * exact pattern of subscribing to a value that lives outside React.
 */
export function useVoiceStore(): Snapshot {
  return useSyncExternalStore(
    (fn) => voiceStore.subscribe(fn),
    () => voiceStore.getSnapshot(),
    // SSR fallback — quiet defaults so Astro's hydration sees something sane.
    () => ({
      state: 'idle',
      error: null,
      track: undefined,
      wakeAt: null,
      isActive: false
    })
  )
}
