import {
  AKSARA_MODEL,
  AKSARA_SYSTEM_PROMPT,
  AKSARA_TOOLS,
  AKSARA_VOICE
} from './system-prompt'
import {
  buildSessionStartHint,
  formatBundleForPrompt,
  loadAksaraContext
} from './site-context'
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

  constructor(private opts: GeminiLiveClientOpts) {}

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
              tools: AKSARA_TOOLS,
              realtimeInputConfig: {
                automaticActivityDetection: {
                  startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                  endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                },
              },
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
        } else if (this.state !== 'idle' && this.state !== 'sleeping') {
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
    if (msg.goAway) {
      console.warn('[gemini-live] goAway', msg.goAway)
    }
  }

  private async dispatchToolCalls(calls: FunctionCall[]) {
    const responses = await Promise.all(
      calls.map(async (call) => {
        try {
          let output: unknown
          if (call.name === 'search_movies_tv') {
            output = await searchMoviesTv(String(call.args.query ?? ''))
          } else {
            output = { error: `unknown tool: ${call.name}` }
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
