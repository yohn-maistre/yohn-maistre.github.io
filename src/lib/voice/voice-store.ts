/*
 * voice-store.ts — module-level singleton that owns the GeminiLiveClient,
 * the WebSocket, and the agent state machine. Both the bento-tile
 * <VoiceAgent> on home and the corner <AksaraCorner> everywhere else
 * subscribe to this store via `useVoiceStore()`.
 *
 * Why a module singleton instead of React Context:
 *   When Astro's ClientRouter swaps pages, React unmounts the old island
 *   tree. A Context lives in the React tree and would unmount with it,
 *   losing the WS. A module-level binding survives because Astro doesn't
 *   reload the JS bundle on client-side nav — module identity is stable
 *   across `astro:after-swap` events.
 *
 * Chimes live here too so we never double-play them when both surfaces are
 * mounted simultaneously (which happens during nav transitions).
 */

import {
  GeminiLiveClient,
  type AgentError,
  type AgentState
} from './gemini-live-client'
import {
  playConnectChime,
  playDisconnectChime,
  playErrorChime
} from './chimes'
import { checkQuota, quotaCopy, recordSessionStart } from './quota'

type Listener = () => void

interface Snapshot {
  state: AgentState
  error: AgentError | null
  track: MediaStreamTrack | undefined
  wakeAt: number | null
  /** Audio amplitude in [0..1], updated by whichever surface is rendering. */
  isActive: boolean
}

let _client: GeminiLiveClient | null = null
let _state: AgentState = 'idle'
let _prevState: AgentState = 'idle'
let _error: AgentError | null = null
let _track: MediaStreamTrack | undefined
let _wakeAt: number | null = null

/**
 * Cached snapshot. CRITICAL: useSyncExternalStore demands referential
 * stability — if getSnapshot returns a new object every call, React
 * detects "constant state change" and either spams renders or throws
 * "Maximum update depth exceeded" and unmounts the subscriber. So we
 * rebuild the snapshot only when something actually changed, via emit().
 */
let _snapshot: Snapshot = {
  state: _state,
  error: _error,
  track: _track,
  wakeAt: _wakeAt,
  isActive: false
}

/**
 * Same-kind error bursts within this window scale the sleep delay. Identical
 * to what the individual components used to track — moved up here so it
 * persists across nav like the rest of the session state.
 */
const ERROR_BURST_WINDOW_MS = 60_000
let _recentErrors: Array<{ kind: string; at: number }> = []

const _listeners = new Set<Listener>()

function rebuildSnapshot(): void {
  _snapshot = {
    state: _state,
    error: _error,
    track: _track,
    wakeAt: _wakeAt,
    isActive: _client !== null
  }
}

function emit(): void {
  rebuildSnapshot()
  for (const fn of _listeners) fn()
}

function setState(s: AgentState): void {
  if (s === _state) return
  _prevState = _state
  _state = s
  // Centralised chimes — fires once per transition regardless of how many
  // surfaces are subscribed.
  if (_prevState === 'idle' && s === 'listening') playConnectChime()
  if ((_prevState === 'listening' || _prevState === 'speaking' || _prevState === 'thinking') && s === 'idle') {
    playDisconnectChime()
  }
  if (s === 'sleeping' || s === 'error') playErrorChime()
  // CRITICAL: when the client falls back to idle but its WS is no longer
  // alive (hard cutoff, ws.onclose, fatal error), null the reference so the
  // next start() doesn't bail out with "if (_client) return" and look like
  // a dead click. Without this, the visitor would click the orb after the
  // 3-min cap and see nothing happen.
  if (s === 'idle' && _client && !_client.isResumable) {
    console.log('[voice-store] client no longer resumable — clearing for fresh start next time')
    _client = null
    _track = undefined
  }
  emit()
}

/** Auto-wake when the cooldown elapses. Driven by a setInterval started lazily. */
let _wakeInterval = 0
function ensureWakeWatcher(): void {
  if (_wakeInterval) return
  _wakeInterval = window.setInterval(() => {
    if (_state === 'sleeping' && _wakeAt && Date.now() >= _wakeAt) {
      _wakeAt = null
      _error = null
      setState('idle')
    }
    emit() // tick the countdown subscribers
  }, 1000)
}

export const voiceStore = {
  getSnapshot: () => _snapshot,

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => {
      _listeners.delete(fn)
    }
  },

  async start(opts: { lang: 'en' | 'id'; pathname: string }): Promise<void> {
    // RESUME path — if a client exists, its WS is still alive, and we're
    // currently idle, just un-mute the mic. No auth_tokens call, no mic
    // check, conversation history intact.
    if (_client && _client.isResumable && _state === 'idle') {
      console.log('[voice-store] resuming paused session')
      _client.resume()
      return
    }
    if (_client) return
    if (_state === 'sleeping') return
    if (!import.meta.env.PUBLIC_TOKEN_ENDPOINT) {
      _error = { kind: 'auth', message: 'Token endpoint not configured.' }
      emit()
      return
    }

    const q = checkQuota()
    if (!q.ok) {
      console.log('[voice-store] quota gate', q)
      _error = {
        kind: 'rate-limit',
        message: quotaCopy(q, opts.lang),
        retryAfter: q.retryAfter
      }
      _wakeAt = Date.now() + (q.retryAfter ?? 60) * 1000
      ensureWakeWatcher()
      setState('sleeping')
      return
    }
    recordSessionStart()
    _error = null

    const client = new GeminiLiveClient({
      onState: setState,
      onPlaybackTrack: (t) => {
        _track = t
        emit()
      },
      onError: (e) => {
        console.error('[voice-store]', e.kind, e.message, 'retryAfter=', e.retryAfter)
        _error = e
        // Burst-penalty bookkeeping — same logic the components had.
        const cutoff = Date.now() - ERROR_BURST_WINDOW_MS
        _recentErrors = _recentErrors.filter((r) => r.at >= cutoff)
        _recentErrors.push({ kind: e.kind, at: Date.now() })
        const sameKindBurst = _recentErrors.filter((r) => r.kind === e.kind).length
        const baseDelay = (e.retryAfter ?? 60) * 1000
        const burstMultiplier = Math.min(2 ** Math.max(0, sameKindBurst - 1), 32)
        const sleepFor = Math.min(baseDelay * burstMultiplier, 10 * 60_000)
        if (e.kind === 'rate-limit' || e.kind === 'quota') {
          _wakeAt = Date.now() + sleepFor
          ensureWakeWatcher()
        }
        emit()
      },
      lang: opts.lang,
      pathname: opts.pathname
    })
    _client = client
    try {
      await client.connect()
    } catch {
      _client = null
    }
  },

  /**
   * "Stop" from the visitor's perspective = pause. The WebSocket stays
   * open, the mic mutes, playback halts. Next start() in the same visit
   * resumes the conversation without a fresh greeting/mic check. The WS
   * is fully closed by destroy() on page unload (registered below).
   */
  stop(): void {
    if (_client?.isResumable) {
      _client.pause()
    } else {
      _client?.disconnect()
      _client = null
      _track = undefined
    }
    emit()
  },

  /** Hard close — used on page unload + after the 3 min hard cutoff. */
  destroy(): void {
    _client?.disconnect()
    _client = null
    _track = undefined
    emit()
  },

  /**
   * Push live locale + pathname into the client so the tool handlers see the
   * current view. Both surfaces call this on mount + when they detect a
   * navigation event.
   */
  updateContext(next: { lang?: 'en' | 'id'; pathname?: string }): void {
    _client?.updateContext(next)
  }
}

// Close the WS for real when the visitor leaves the site. Without this
// the session would linger as a held connection on Yose's free tier.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => voiceStore.destroy())
}

export type { Snapshot }
