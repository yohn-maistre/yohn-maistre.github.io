/*
 * Tiny synthesized chimes for connect/disconnect/error feedback. Each
 * opens its own short-lived AudioContext, plays one envelope, and
 * closes — no asset weight, no autoplay-policy traps once the user has
 * clicked once. All chimes respect `prefers-reduced-motion`.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface ChimeNote {
  freq: number
  start: number // seconds from now
  duration: number
  type?: OscillatorType
  detune?: number
}

const VOLUME = 0.12

async function play(notes: ChimeNote[]): Promise<void> {
  if (prefersReducedMotion()) return
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const total = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.connect(ctx.destination)

    for (const n of notes) {
      const osc = ctx.createOscillator()
      osc.type = n.type ?? 'sine'
      osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start)
      if (n.detune) osc.detune.setValueAtTime(n.detune, ctx.currentTime + n.start)
      const noteGain = ctx.createGain()
      noteGain.gain.setValueAtTime(0, ctx.currentTime + n.start)
      noteGain.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + n.start + 0.03)
      noteGain.gain.linearRampToValueAtTime(0, ctx.currentTime + n.start + n.duration)
      osc.connect(noteGain)
      noteGain.connect(gain)
      osc.start(ctx.currentTime + n.start)
      osc.stop(ctx.currentTime + n.start + n.duration + 0.05)
    }

    // Master fade-in to avoid click
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02)

    setTimeout(() => ctx.close().catch(() => {}), (total + 0.2) * 1000)
  } catch {
    /* swallow — chimes are non-essential */
  }
}

export function playConnectChime(): void {
  void play([
    { freq: 523.25, start: 0, duration: 0.12, type: 'sine' }, // C5
    { freq: 659.25, start: 0.08, duration: 0.14, type: 'sine' } // E5
  ])
}

export function playDisconnectChime(): void {
  void play([
    { freq: 659.25, start: 0, duration: 0.12, type: 'sine' }, // E5
    { freq: 523.25, start: 0.08, duration: 0.14, type: 'sine' } // C5
  ])
}

export function playErrorChime(): void {
  void play([
    { freq: 220, start: 0, duration: 0.08, type: 'square', detune: 8 } // A3
  ])
}
