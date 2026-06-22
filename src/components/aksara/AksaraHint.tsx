import { useEffect, useState } from 'react'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

interface AksaraHintProps {
  lang: 'en' | 'id'
  /** Hint only appears when Aksara is idle. */
  active: boolean
  /** Which corner the orb is anchored to — bubble follows. Defaults to 'br'. */
  corner?: Corner
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

export default function AksaraHint({ lang, active, corner = 'br' }: AksaraHintProps) {
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

  // Bubble sits ABOVE the orb when orb is on a bottom corner, BELOW when on
  // a top corner. Tail points toward the orb (down/up). Avoids fighting the
  // page footer/header that the orb often parks itself next to.
  const isTop = corner === 'tl' || corner === 'tr'
  const isLeft = corner === 'tl' || corner === 'bl'
  const ORB_SIZE = 60
  const GAP = 14
  const SAFE_X = 'max(env(safe-area-inset-right, 0px), 1rem)'
  const SAFE_X_L = 'max(env(safe-area-inset-left, 0px), 1rem)'
  const SAFE_Y = 'max(env(safe-area-inset-bottom, 0px), 1rem)'
  const SAFE_Y_T = 'max(env(safe-area-inset-top, 0px), 1rem)'

  const positionStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 49,
    ...(isTop
      ? { top: `calc(${SAFE_Y_T} + ${ORB_SIZE}px + ${GAP}px)` }
      : { bottom: `calc(${SAFE_Y} + ${ORB_SIZE}px + ${GAP}px)` }),
    ...(isLeft ? { left: SAFE_X_L } : { right: SAFE_X })
  }

  // Tail points back toward the orb (down if bubble is above, up if below).
  const tailStyle: React.CSSProperties = isTop
    ? {
        position: 'absolute',
        top: -6,
        ...(isLeft ? { left: 22 } : { right: 22 }),
        width: 0,
        height: 0,
        borderBottom: '6px solid hsl(var(--secondary) / 0.92)',
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent'
      }
    : {
        position: 'absolute',
        bottom: -6,
        ...(isLeft ? { left: 22 } : { right: 22 }),
        width: 0,
        height: 0,
        borderTop: '6px solid hsl(var(--secondary) / 0.92)',
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent'
      }

  return (
    <div
      role='status'
      aria-live='polite'
      style={{
        ...positionStyle,
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
        animation: reducedMotion
          ? 'none'
          : `aksaraHintIn 320ms cubic-bezier(.22,1,.36,1)`,
        transformOrigin: `${isLeft ? 'left' : 'right'} ${isTop ? 'top' : 'bottom'}`
      }}
    >
      {text}
      <span aria-hidden='true' style={tailStyle} />
      <style>{`
        @keyframes aksaraHintIn {
          0% { opacity: 0; transform: scale(0.85) translateY(${isTop ? '-6px' : '6px'}); }
          70% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
