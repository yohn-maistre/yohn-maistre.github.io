import { useEffect, useState } from 'react'

interface AksaraHintProps {
  lang: 'en' | 'id'
  /** Hint only appears when Aksara is idle. */
  active: boolean
}

const HINTS: Record<'en' | 'id', string[]> = {
  id: [
    'klik aku ya 🤍',
    'aku mau ngobrol nih',
    'sini, ngobrol bentar',
    'tap aja, nggak gigit',
    'Aksara di sini',
    'mau dengar cerita Yose?'
  ],
  en: [
    'tap me to say hi',
    "Aksara's dying to chat",
    'psst — say something',
    "I've got stories",
    'tap for a story',
    "ask me about Yose's work"
  ]
}

// How long before the first bubble, then how long between bubbles.
const INITIAL_DELAY_MS = 6_000
const REPEAT_DELAY_MS = 50_000
const VISIBLE_MS = 10_000

function pickHint(lang: 'en' | 'id', prev: string | null): string {
  const pool = HINTS[lang]
  if (pool.length <= 1) return pool[0]
  while (true) {
    const choice = pool[Math.floor(Math.random() * pool.length)]
    if (choice !== prev) return choice
  }
}

export default function AksaraHint({ lang, active }: AksaraHintProps) {
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState<string>(() => HINTS[lang][0])
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    let cancelled = false
    let prev: string | null = null
    let hideTimer = 0
    let nextTimer = 0

    const show = () => {
      if (cancelled) return
      const next = pickHint(lang, prev)
      prev = next
      setText(next)
      setVisible(true)
      hideTimer = window.setTimeout(() => {
        if (cancelled) return
        setVisible(false)
        nextTimer = window.setTimeout(show, REPEAT_DELAY_MS - VISIBLE_MS)
      }, VISIBLE_MS)
    }

    nextTimer = window.setTimeout(show, INITIAL_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(hideTimer)
      window.clearTimeout(nextTimer)
    }
  }, [active, lang])

  if (!visible) return null

  return (
    <div
      role='status'
      aria-live='polite'
      style={{
        position: 'fixed',
        right: 'calc(max(env(safe-area-inset-right, 0px), 1rem) + 70px)',
        bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 1rem) + 12px)',
        zIndex: 49,
        background: 'hsl(var(--secondary) / 0.92)',
        color: 'hsl(var(--secondary-foreground))',
        border: '1px solid hsl(var(--border))',
        padding: '0.45rem 0.85rem',
        borderRadius: 18,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
        animation: reducedMotion ? 'none' : 'aksaraHintIn 320ms cubic-bezier(.22,1,.36,1)',
        transformOrigin: 'right center'
      }}
    >
      {text}
      <span
        aria-hidden='true'
        style={{
          position: 'absolute',
          right: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid hsl(var(--secondary) / 0.92)',
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent'
        }}
      />
      <style>{`
        @keyframes aksaraHintIn {
          0% { opacity: 0; transform: scale(0.85) translateX(8px); }
          70% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1) translateX(0); }
        }
      `}</style>
    </div>
  )
}
