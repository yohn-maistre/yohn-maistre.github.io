import {
  AKSARA_MODEL,
  AKSARA_SYSTEM_PROMPT,
  AKSARA_VOICE
} from './system-prompt'
import {
  buildSessionStartHint,
  formatBundleForPrompt,
  loadAksaraContext
} from './site-context'
import { AKSARA_GEMINI_TOOLS, runTool, type ToolContext } from './tools'
import { searchMoviesTv } from './tmdb-tool'

const TOKEN_ENDPOINT = import.meta.env.PUBLIC_TOKEN_ENDPOINT as string
const LIVE_WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'

const INPUT_SAMPLE_RATE = 16000
const OUTPUT_SAMPLE_RATE = 24000

export type AgentState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'sleeping'
  | 'error'

export type ErrorKind =
  | 'rate-limit'
  | 'quota'
  | 'auth'
  | 'network'
  | 'mic-denied'
  | 'unknown'

export interface AgentError {
  kind: ErrorKind
  message: string
  /** Seconds until retry is sensible. Always set for rate-limit/quota. */
  retryAfter?: number
}

export interface GeminiLiveClientOpts {
  onState: (s: AgentState) => void
  onPlaybackTrack?: (track: MediaStreamTrack | undefined) => void
  onError?: (e: AgentError) => void
  /** UI locale at session start. Defaults to 'id' to match the site's primary audience. */
  lang?: 'en' | 'id'
  /** Initial pathname; tool handlers see live values via updateContext. */
  pathname?: string
  /** Programmatic navigation hook. Defaults to `window.location.assign` if omitted. */
  navigate?: (path: string) => void
  /** Optional toast hook surfaced to tools that act on the user's behalf. */
  toast?: (msg: string) => void
}

interface FunctionCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export class GeminiLiveClient {
  private ws?: WebSocket
  private captureCtx?: AudioContext
  private playbackCtx?: AudioContext
  private playbackDest?: MediaStreamAudioDestinationNode
  private worklet?: AudioWorkletNode
  private mic?: MediaStream
  private playbackQueueEnd = 0
  private activeSources = new Set<AudioBufferSourceNode>()
  private state: AgentState = 'idle'
  private ctxLang: 'en' | 'id' = 'id'
  private ctxPathname: string = '/'
  /** Session-resumption handle from the server; passed back on reconnect to restore context. */
  private resumeHandle?: string
  /** Hard session ceilings — see GUARDRAILS.md (or this file) for rationale. */
  private windDownTimer = 0
  private hardCutoffTimer = 0
  /** Soft wind-down at 150 s, hard cutoff at 180 s. Protects the free-tier 10 RPM / 1500 RPD budget. */
  private static readonly WIND_DOWN_MS = 150_000
  private static readonly HARD_CUTOFF_MS = 180_000
  /** Each segment recycles the WS via the resumption handle (seamless). After
   * MAX_RECYCLES the visit hits its ceiling and Aksara winds down for real.
   * Step 3 (KV) will replace this per-visit ceiling with a per-day budget. */
  private static readonly MAX_RECYCLES = 2
  private recycleCount = 0
  private reconnecting = false

  constructor(private opts: GeminiLiveClientOpts) {
    this.ctxLang = opts.lang ?? 'id'
    this.ctxPathname = opts.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  }

  /**
   * Update the locale/pathname tool handlers see. Call from the host
   * component whenever the user navigates or switches language so tools
   * always operate on the live view.
   */
  updateContext(next: { lang?: 'en' | 'id'; pathname?: string }): void {
    let changed = false
    if (next.lang && next.lang !== this.ctxLang) {
      this.ctxLang = next.lang
      changed = true
      // Nudge Aksara to switch language smoothly mid-session.
      this.ws?.send(
        JSON.stringify({
          clientContent: {
            turns: [
              { role: 'user', parts: [{ text: `[locale changed to ${next.lang}]` }] }
            ],
            turnComplete: false
          }
        })
      )
    }
    if (next.pathname && next.pathname !== this.ctxPathname) {
      this.ctxPathname = next.pathname
      changed = true
    }
    if (changed) console.log('[gemini-live] context', this.ctxLang, this.ctxPathname)
  }

  /**
   * Programmatic clientContent turn — used by tools (e.g. read_aloud) to
   * pipe text back into Aksara's response stream.
   */
  injectSystemTurn(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        }
      })
    )
  }

  async connect(): Promise<void> {
    this.setState('connecting')
    try {
      // Mint token and bundle in parallel — they're independent and the
      // bundle fetch hits the same origin's edge cache.
      const [token, bundle] = await Promise.all([
        this.fetchToken(),
        loadAksaraContext().catch((e) => {
          console.warn('[gemini-live] context bundle failed', e)
          return null
        })
      ])
      const contextSuffix = bundle ? '\n\n' + formatBundleForPrompt(bundle) : ''
      await this.openSocket(token, contextSuffix)
      await this.startCapture()
      this.sendGreetingPrimer()
      this.armSessionCaps()
      this.setState('listening')
    } catch (e) {
      const err = this.classifyError(e)
      this.opts.onError?.(err)
      // Sleeping states get their own animation; everything else is "error"
      this.setState(err.kind === 'rate-limit' || err.kind === 'quota' ? 'sleeping' : 'error')
      this.disconnect({ keepState: true })
      throw e
    }
  }

  private classifyError(raw: unknown): AgentError {
    if (raw instanceof Error) {
      const m = raw.message
      // Token mint failures are formatted by fetchToken with the body verbatim.
      try {
        const inner = m.match(/\{.*\}/s)?.[0]
        if (inner) {
          const parsed = JSON.parse(inner) as { kind?: ErrorKind; retryAfter?: number; error?: string }
          if (parsed.kind) return { kind: parsed.kind, message: parsed.error ?? m, retryAfter: parsed.retryAfter }
        }
      } catch {}
      if (/permission|NotAllowedError|denied/i.test(m)) {
        return { kind: 'mic-denied', message: m }
      }
      if (/429/.test(m)) return { kind: 'rate-limit', message: m, retryAfter: 60 }
      if (/401|403/.test(m)) return { kind: 'auth', message: m }
      if (/WebSocket|fetch|Network/i.test(m)) return { kind: 'network', message: m }
      return { kind: 'unknown', message: m }
    }
    return { kind: 'unknown', message: String(raw) }
  }

  disconnect(opts: { keepState?: boolean } = {}): void {
    this.clearSessionCaps()
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) this.ws.close()
    this.ws = undefined
    this.stopAllPlayback()
    this.worklet?.disconnect()
    this.worklet = undefined
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = undefined
    this.captureCtx?.close().catch(() => {})
    this.captureCtx = undefined
    this.playbackCtx?.close().catch(() => {})
    this.playbackCtx = undefined
    this.playbackDest = undefined
    this.opts.onPlaybackTrack?.(undefined)
    // When connect() fails into a sleeping/error state we don't want to
    // immediately blow it away by setting 'idle'.
    if (!opts.keepState) this.setState('idle')
  }

  /**
   * Pause the session WITHOUT killing the WebSocket. The mic tracks are
   * muted (still producing silence, no upstream tokens spent), playback
   * is stopped mid-chunk, the hard-cutoff timer is paused. A subsequent
   * resume() un-mutes the mic and Aksara picks up the same conversation
   * — no auth_tokens call, no fresh setup turn, no mic check.
   *
   * Used by voiceStore.stop() so "stop and start again within the same
   * visit" doesn't lose the conversational thread.
   */
  pause(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.mic?.getTracks().forEach((t) => (t.enabled = false))
    this.stopAllPlayback()
    this.clearSessionCaps()
    this.setState('idle')
  }

  /**
   * Inverse of pause(). Returns true if the existing WS could be reused;
   * false means the WS is dead and the caller should do a full connect().
   */
  resume(): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.mic?.getTracks().forEach((t) => (t.enabled = true))
    this.armSessionCaps()
    // Quick acknowledgement nudge so Aksara doesn't just sit silent.
    this.injectSystemTurn(
      '[user resumed after a brief pause within the same visit — acknowledge them briefly in the language they were using (e.g. "hai lagi" / "hey, you\'re back"), then go quiet. DO NOT re-do the mic check or the full greeting. The conversation history above this hint is intact — pick up where you left off if relevant.]'
    )
    this.setState('listening')
    return true
  }

  /** True iff the WS is alive and the session can be resumed. */
  get isResumable(): boolean {
    return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Hard session ceilings — Gemini Live's free tier is 10 RPM / 1500 RPD.
   * A single visitor parking on the page indefinitely could drain the day's
   * budget for everyone, so we cap every session at 3 minutes with a 30 s
   * graceful wind-down. The model gets a synthetic prompt at the wind-down
   * mark telling it to wrap warmly, then the WS gets closed at the hard mark.
   */
  private armSessionCaps(): void {
    this.clearSessionCaps()
    // Each segment runs up to HARD_CUTOFF_MS, then recycles the socket via the
    // resumption handle so the conversation continues seamlessly. No per-segment
    // "session closing" message anymore — the recycle is meant to be invisible.
    this.hardCutoffTimer = window.setTimeout(() => this.recycleOrEnd(), GeminiLiveClient.HARD_CUTOFF_MS)
  }

  /**
   * At a segment boundary (our timer) or a server `goAway`: if we still hold a
   * resumption handle and haven't hit the per-visit ceiling, reconnect-with-
   * handle to keep going. Otherwise wind down for real with a warm goodbye.
   */
  private recycleOrEnd(): void {
    this.clearSessionCaps()
    if (this.resumeHandle && this.recycleCount < GeminiLiveClient.MAX_RECYCLES) {
      this.recycleCount++
      console.log('[gemini-live] recycling segment', this.recycleCount, 'of', GeminiLiveClient.MAX_RECYCLES)
      void this.reconnectWithHandle()
      return
    }
    console.log('[gemini-live] per-visit ceiling reached — winding down')
    this.injectSystemTurn(
      '[wind down — the conversation has reached its limit for now and will close in a few seconds. ' +
      'In the language the visitor has been using, warmly let them know they can come back anytime — ' +
      "even tomorrow — and you'll pick things up. One short, warm goodbye. Do not over-apologize, " +
      'do not pretend it was your idea.]'
    )
    this.windDownTimer = window.setTimeout(() => this.disconnect(), 8000)
  }

  /**
   * Seamless reconnect that preserves the conversation: mint a fresh ephemeral
   * token, open a new socket passing the stored resumption handle, re-arm caps.
   * Mic capture + playback contexts stay alive (the worklet targets `this.ws`,
   * which we reassign). No greeting / mic-check. Fail-safe: any error falls back
   * to a clean disconnect, so the worst case equals the pre-resumption behavior.
   */
  private async reconnectWithHandle(): Promise<void> {
    if (this.reconnecting) return
    this.reconnecting = true
    try {
      // Detach the old socket's handlers so its close() doesn't trip the
      // teardown/reconnect logic, then close it. Mic + playback stay up.
      const old = this.ws
      this.ws = undefined
      if (old) {
        old.onopen = null
        old.onmessage = null
        old.onerror = null
        old.onclose = null
        if (old.readyState !== WebSocket.CLOSED) old.close()
      }
      const [token, bundle] = await Promise.all([
        this.fetchToken(),
        loadAksaraContext().catch(() => null)
      ])
      const contextSuffix = bundle ? '\n\n' + formatBundleForPrompt(bundle) : ''
      await this.openSocket(token, contextSuffix)
      // No greeting primer: the server restores context from the handle.
      this.armSessionCaps()
      this.setState('listening')
    } catch (e) {
      console.error('[gemini-live] reconnect-with-handle failed — closing', e)
      this.disconnect()
    } finally {
      this.reconnecting = false
    }
  }

  private clearSessionCaps(): void {
    if (this.windDownTimer) {
      window.clearTimeout(this.windDownTimer)
      this.windDownTimer = 0
    }
    if (this.hardCutoffTimer) {
      window.clearTimeout(this.hardCutoffTimer)
      this.hardCutoffTimer = 0
    }
  }

  private setState(s: AgentState) {
    if (this.state === s) return
    this.state = s
    this.opts.onState(s)
  }

  private async fetchToken(): Promise<string> {
    const url = `${TOKEN_ENDPOINT}/token`
    console.log('[gemini-live] POST', url)
    let res: Response
    try {
      res = await fetch(url, { method: 'POST' })
    } catch (e) {
      throw new Error(`Network: ${(e as Error).message}`)
    }
    if (!res.ok) {
      // Worker returns { error, kind, retryAfter? } — pass it through so
      // classifyError can pick it up.
      const body = await res.text().catch(() => '')
      throw new Error(`Token mint failed ${res.status}: ${body}`)
    }
    const body = (await res.json()) as { name?: string }
    if (!body.name) throw new Error('Token response missing "name" field')
    console.log('[gemini-live] got ephemeral token')
    return body.name
  }

  private openSocket(token: string, contextSuffix = ''): Promise<void> {
    const url = `${LIVE_WS_BASE}?access_token=${encodeURIComponent(token)}`
    const systemText = AKSARA_SYSTEM_PROMPT + contextSuffix
    console.log('[gemini-live] WS opening', LIVE_WS_BASE, '— systemInstruction', systemText.length, 'chars')
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws
      ws.binaryType = 'arraybuffer'

      let setupAcked = false

      ws.onopen = () => {
        console.log('[gemini-live] WS open, sending setup')
        ws.send(
          JSON.stringify({
            setup: {
              model: AKSARA_MODEL,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: AKSARA_VOICE },
                  },
                  languageCode: 'id-ID',
                },
              },
              systemInstruction: { parts: [{ text: systemText }] },
              tools: AKSARA_GEMINI_TOOLS,
              realtimeInputConfig: {
                automaticActivityDetection: {
                  startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                  endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                },
              },
              // Session resumption: the server emits sessionResumptionUpdate frames
              // carrying a newHandle; we store it (see handleServer) and pass it back
              // on reconnect to restore conversation context. null = fresh session.
              sessionResumption: { handle: this.resumeHandle ?? null },
              // Context-window compression (sliding window) lifts the 15-min audio
              // session ceiling to unlimited by pruning the oldest turns server-side.
              contextWindowCompression: { slidingWindow: {} },
            },
          })
        )
      }

      ws.onmessage = async (ev) => {
        try {
          const text = await toText(ev.data)
          const msg = JSON.parse(text)
          if (msg.setupComplete && !setupAcked) {
            console.log('[gemini-live] setupComplete')
            setupAcked = true
            resolve()
          }
          this.handleServer(msg)
        } catch (e) {
          console.warn('[gemini-live] message parse error', e)
        }
      }

      ws.onerror = (e) => {
        console.error('[gemini-live] WS error', e)
        if (!setupAcked) reject(new Error('WebSocket error before setup'))
      }

      ws.onclose = (ev) => {
        console.log('[gemini-live] WS close', ev.code, ev.reason)
        // Codes 1008 (policy), 1011 (server), 1013 (try-again) on Gemini
        // Live's WS map to rate-limit/quota in practice. Treat as sleeping.
        const rateLimitCodes = [1008, 1011, 1013]
        if (!setupAcked) {
          if (rateLimitCodes.includes(ev.code)) {
            const synthetic = JSON.stringify({ kind: 'rate-limit', retryAfter: 60, error: ev.reason })
            reject(new Error(`Token mint failed 429: ${synthetic}`))
          } else {
            reject(new Error(`WebSocket closed: ${ev.code} ${ev.reason}`))
          }
        } else if (rateLimitCodes.includes(ev.code) && this.state !== 'idle' && this.state !== 'sleeping') {
          // Mid-session rate-limit: surface to the app and enter sleeping.
          this.opts.onError?.({ kind: 'rate-limit', message: `WS ${ev.code}: ${ev.reason}`, retryAfter: 60 })
          this.setState('sleeping')
          this.disconnect({ keepState: true })
        } else if (this.state === 'idle') {
          // WS died while paused — most likely Gemini's own idle timeout
          // or a network blip after the visitor paused. Clear the ws ref so
          // isResumable starts returning false and voiceStore.start() drops
          // the stale client + does a fresh connect on the next click,
          // instead of bailing on `if (_client) return` like before.
          console.log('[gemini-live] WS died while paused — marking unresumable')
          this.ws = undefined
        } else if (this.state !== 'sleeping') {
          this.disconnect()
        }
      }
    })
  }

  /**
   * Synthetic first turn that asks Aksara to greet the user. The text
   * mirrors the trigger string the system prompt watches for. Locale +
   * hour are included so the greeting can be time-aware.
   */
  private sendGreetingPrimer(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const lang: 'en' | 'id' = this.opts.lang ?? 'id'
    const hour = new Date().getHours()
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            { role: 'user', parts: [{ text: buildSessionStartHint({ lang, hour }) }] }
          ],
          turnComplete: true
        }
      })
    )
  }

  private async startCapture(): Promise<void> {
    console.log('[gemini-live] startCapture')
    this.captureCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
    await this.captureCtx.audioWorklet.addModule('/voice/pcm-worklet.js')

    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
    } catch (e) {
      // Re-tag the error so classifyError routes it to 'mic-denied'.
      throw new Error(`Mic permission denied: ${(e as Error).message}`)
    }
    console.log('[gemini-live] mic granted, ctx sampleRate', this.captureCtx.sampleRate)
    const source = this.captureCtx.createMediaStreamSource(this.mic)
    this.worklet = new AudioWorkletNode(this.captureCtx, 'pcm16-downsampler')
    let chunkCount = 0
    this.worklet.port.onmessage = (ev) => {
      const buf = ev.data as ArrayBuffer
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (chunkCount === 0) console.log('[gemini-live] first audio chunk out')
      chunkCount++
      this.ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: { data: arrayBufferToBase64(buf), mimeType: 'audio/pcm;rate=16000' },
          },
        })
      )
    }
    source.connect(this.worklet)
  }

  private handleServer(msg: any) {
    // First-glance log of any non-setup server frame so we can see what
    // shape Gemini actually sends back in the wild.
    if (!msg.setupComplete) console.log('[gemini-live] server frame', Object.keys(msg))
    if (msg.serverContent) {
      const sc = msg.serverContent
      if (sc.interrupted) {
        this.stopAllPlayback()
        this.setState('listening')
      }
      const parts: any[] = sc.modelTurn?.parts ?? []
      let gotAudio = false
      for (const part of parts) {
        const inline = part.inlineData
        if (inline?.mimeType?.startsWith('audio/')) {
          gotAudio = true
          this.setState('speaking')
          this.enqueuePlayback(inline.data)
        }
      }
      if (!gotAudio && parts.length === 0 && !sc.interrupted && !sc.turnComplete) {
        this.setState('thinking')
      }
      if (sc.turnComplete) this.setState('listening')
    }
    if (msg.toolCall) {
      console.log('[gemini-live] toolCall', msg.toolCall)
      this.dispatchToolCalls(msg.toolCall.functionCalls ?? [])
    }
    if (msg.sessionResumptionUpdate) {
      const u = msg.sessionResumptionUpdate
      if (u.resumable && u.newHandle) {
        this.resumeHandle = u.newHandle
        console.log('[gemini-live] resumption handle updated', String(u.newHandle).slice(0, 12) + '…')
      }
    }
    if (msg.goAway) {
      // Google force-closes the WS ~every 10 min; goAway warns ahead of time.
      // Recycle-with-handle so the conversation survives the forced drop.
      console.warn('[gemini-live] goAway — timeLeft', msg.goAway?.timeLeft)
      this.recycleOrEnd()
    }
  }

  private async dispatchToolCalls(calls: FunctionCall[]) {
    const ctx: ToolContext = {
      lang: this.ctxLang,
      pathname: this.ctxPathname,
      navigate:
        this.opts.navigate ??
        ((path) => {
          if (typeof window === 'undefined') return
          // Prefer Astro's client-side navigate (exposed by BaseLayout as
          // window.__astroNavigate) — it preserves module-level state, so
          // the WebSocket + audio playback survive the route swap.
          // window.location.assign would do a full reload and kill the WS,
          // cutting Aksara off mid-sentence.
          const astroNav = (window as any).__astroNavigate as
            | ((p: string) => void)
            | undefined
          if (typeof astroNav === 'function') {
            astroNav(path)
          } else {
            window.location.assign(path)
          }
        }),
      toast: this.opts.toast,
      injectSystemTurn: (t) => this.injectSystemTurn(t)
    }
    const responses = await Promise.all(
      calls.map(async (call) => {
        try {
          let output: unknown
          if (call.name === 'search_movies_tv') {
            output = await searchMoviesTv(String(call.args.query ?? ''))
          } else {
            output = await runTool(call.name, call.args, ctx)
          }
          return { id: call.id, name: call.name, response: { output } }
        } catch (e) {
          return {
            id: call.id,
            name: call.name,
            response: { error: (e as Error).message },
          }
        }
      })
    )
    this.ws?.send(JSON.stringify({ toolResponse: { functionResponses: responses } }))
  }

  private enqueuePlayback(b64: string) {
    if (!this.playbackCtx) {
      this.playbackCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE })
      this.playbackDest = this.playbackCtx.createMediaStreamDestination()
      this.opts.onPlaybackTrack?.(this.playbackDest.stream.getAudioTracks()[0])
    }
    const ctx = this.playbackCtx
    const bytes = base64ToUint8Array(b64)
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
    const float = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000
    const buf = ctx.createBuffer(1, float.length, OUTPUT_SAMPLE_RATE)
    buf.copyToChannel(float, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    if (this.playbackDest) src.connect(this.playbackDest)
    const startAt = Math.max(ctx.currentTime, this.playbackQueueEnd)
    src.start(startAt)
    this.playbackQueueEnd = startAt + buf.duration
    this.activeSources.add(src)
    src.onended = () => this.activeSources.delete(src)
  }

  private stopAllPlayback() {
    for (const src of this.activeSources) {
      try {
        src.stop()
      } catch {}
    }
    this.activeSources.clear()
    this.playbackQueueEnd = 0
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

async function toText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (data instanceof Blob) return data.text()
  return String(data)
}
