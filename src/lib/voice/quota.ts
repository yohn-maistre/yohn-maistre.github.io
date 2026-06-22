/*
 * Client-side session quota. Stops a single curious-but-relentless visitor
 * from draining Yose's Gemini free tier (10 RPM / 1500 RPD). The check is
 * localStorage-only — trivially bypassed by anyone who knows DevTools — but
 * it covers the realistic case of casual abuse (someone leaving the page
 * open + spamming the orb).
 *
 * Limits (relaxed after stress-testing — 5/day was hostile to even normal use):
 *  - 20 successfully-started sessions per rolling 24 h per browser.
 *  - 30 s cooldown between sessions.
 *
 * Escape hatches:
 *  - URL param ?aksara-reset=1 wipes the counter on next load (and cleans
 *    itself out of the URL).
 *  - DevTools: localStorage.removeItem('aksara_sessions_v1')
 */

const KEY_SESSIONS = 'aksara_sessions_v1'
const DAILY_LIMIT = 20
const COOLDOWN_MS = 30_000
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

/**
 * URL-param escape hatch: ?aksara-reset=1 wipes the counter and rewrites
 * the URL so a reload doesn't keep clearing it. Idempotent.
 */
function maybeResetFromURL(): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('aksara-reset') === '1') {
      localStorage.removeItem(KEY_SESSIONS)
      console.log('[quota] reset via ?aksara-reset=1')
      url.searchParams.delete('aksara-reset')
      window.history.replaceState({}, '', url.toString())
    }
  } catch {
    /* SSR / restricted environment — skip */
  }
}

maybeResetFromURL()

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
      ? `tarik napas ${check.retryAfter}s ya`
      : `breath ${check.retryAfter}s`
  }
  // Daily cap — be honest it's a local cap, not Google's. Suggest the reset.
  return lang === 'id'
    ? 'kuota harian browser ini habis — buka DevTools, hapus aksara_sessions_v1 di localStorage kalau mau lanjut tes'
    : "this browser's daily cap is spent — DevTools → remove aksara_sessions_v1 from localStorage if you want to keep testing"
}
