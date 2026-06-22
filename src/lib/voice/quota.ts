/*
 * Client-side session quota. Stops a single curious-but-relentless visitor
 * from draining Yose's Gemini free tier (10 RPM / 1500 RPD). The check is
 * localStorage-only — trivially bypassed by anyone who knows DevTools — but
 * it covers the realistic case of casual abuse (someone leaving the page
 * open + spamming the orb).
 *
 * Limits:
 *  - 5 successfully-started sessions per rolling 24 h per browser.
 *  - 60 s cooldown between sessions.
 */

const KEY_SESSIONS = 'aksara_sessions_v1'
const DAILY_LIMIT = 5
const COOLDOWN_MS = 60_000
const DAY_MS = 24 * 60 * 60_000

interface SessionRecord {
  at: number
}

function read(): SessionRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY_SESSIONS)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SessionRecord[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r) => typeof r?.at === 'number')
  } catch {
    return []
  }
}

function write(records: SessionRecord[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY_SESSIONS, JSON.stringify(records))
  } catch {
    /* private mode / quota — give up silently */
  }
}

export interface QuotaCheck {
  ok: boolean
  /** When ok=false, seconds until the visitor may try again. */
  retryAfter?: number
  reason?: 'cooldown' | 'daily'
  /** Sessions used in the current 24 h window. */
  used: number
}

export function checkQuota(): QuotaCheck {
  const now = Date.now()
  const recent = read().filter((r) => r.at >= now - DAY_MS)
  // Persist the trimmed list so it can't grow forever.
  write(recent)

  if (recent.length === 0) return { ok: true, used: 0 }
  const last = recent[recent.length - 1].at
  if (now - last < COOLDOWN_MS) {
    return {
      ok: false,
      reason: 'cooldown',
      retryAfter: Math.ceil((COOLDOWN_MS - (now - last)) / 1000),
      used: recent.length
    }
  }
  if (recent.length >= DAILY_LIMIT) {
    const oldest = recent[0].at
    return {
      ok: false,
      reason: 'daily',
      retryAfter: Math.ceil((DAY_MS - (now - oldest)) / 1000),
      used: recent.length
    }
  }
  return { ok: true, used: recent.length }
}

export function recordSessionStart(): void {
  const recent = read().filter((r) => r.at >= Date.now() - DAY_MS)
  recent.push({ at: Date.now() })
  write(recent)
}

export function quotaCopy(check: QuotaCheck, lang: 'en' | 'id'): string {
  if (check.ok) return ''
  if (check.reason === 'cooldown') {
    return lang === 'id'
      ? `tunggu ${check.retryAfter}s ya — saya butuh napas dulu`
      : `give me ${check.retryAfter}s — I need a breath`
  }
  // daily
  const minutes = Math.ceil((check.retryAfter ?? 0) / 60)
  const hours = Math.floor(minutes / 60)
  if (lang === 'id') {
    return hours >= 1
      ? `kuota harian habis — coba lagi sekitar ${hours} jam lagi`
      : `kuota harian habis — coba lagi sekitar ${minutes} menit lagi`
  }
  return hours >= 1
    ? `daily quota spent — try again in about ${hours} h`
    : `daily quota spent — try again in about ${minutes} min`
}
