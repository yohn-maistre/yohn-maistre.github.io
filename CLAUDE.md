# CLAUDE.md — yose.is-a.dev (yose-portfolio)

Personal portfolio + blog for Yose (`yohn-maistre`). Astro 5 static site → GitHub Pages (`yose.is-a.dev`), plus one Cloudflare Worker for the voice agent. Full audit in `CODEBASE_GROUNDTRUTH.md` (generated 2026-06-28).

## Stack (the README is stale — trust this)
- Astro 5.14 (`output: 'static'`), React 19 islands, Three.js 0.180 (`@react-three/fiber` + `drei`).
- **UnoCSS** (`@unocss/preset-wind`) — NOT Tailwind. No Spline (the README claims both; both wrong).
- TypeScript, Zod, MiniSearch. **Bun** runs the build scripts.
- i18n: English (default, `/`) + Indonesian (`/id/`).

## Commands
- dev: `bun run dev` · build: `bun run build` (→ `build:aksara-context` + `build:search-index` emit `public/voice/*.json`, then `astro build`)
- check: `bun run check` (astro check) · `bun run check:i18n` (parity, informational only)
- deploy: push `main` → GitHub Pages (`.github/workflows/deploy.yml`); the Worker deploys on `worker/**` changes (`deploy-worker.yml`).
- ⚠️ Resource-constrained host (see global CLAUDE.md): full builds/typechecks can OOM. Prefer targeted edits; don't reflexively run `astro build`.

## Architecture map
- **Voice agent (Aksara)** — the flagship. `src/lib/voice/*` + `worker/src/index.ts`; surfaces are `src/components/bento/VoiceAgent.tsx` (home tile) + `src/components/aksara/AksaraCorner.tsx` (every other page). Detail below.
- **Content** — `src/content/{blog,mind-garden}/{en,id}/`; schemas in `src/content.config.ts`. `_archive/` is dead.
- **i18n** — manual EN/ID page-tree duplication: `src/pages/` vs `src/pages/id/`. `getLangFromUrl` (`src/lib/i18n.ts`). Union-with-fallback + `TranslationPendingBanner`. Parity is NOT enforced in CI.
- **Theme** — forked `@yohn-maistre/astro-pure-fork` (`packages/pure-fork/`). `packages/pure/` is DEAD (see gotchas).
- **Bento home** — Discord (Lanyard), Spotify (last.fm), WakaTime, GitHub calendar, 3D GLB, voice tile. Each fails soft.
- **Worker** — mints Gemini ephemeral tokens (`/token`) + proxies TMDB (`/tmdb/search`). Holds the real API keys.

## Voice agent (Aksara) — how it works
- **State**: module-level singleton `src/lib/voice/voice-store.ts` owns the one `GeminiLiveClient` + WS + a 7-state machine. Lives OUTSIDE React so it survives Astro `ClientRouter` page swaps. Both surfaces subscribe via `useVoiceStore()` (`useSyncExternalStore`).
- **Client**: `src/lib/voice/gemini-live-client.ts` — WS to Gemini Live, mic→PCM16 worklet (`public/voice/pcm-worklet.js`), 24kHz playback, tool dispatch, session caps.
- **Model**: `gemini-3.1-flash-live-preview` (`system-prompt.ts:1`), voice `Aoede`. Audio: 16kHz PCM in / 24kHz PCM out (matches Google's spec exactly — don't change).
- **Tools** (`tools.ts`): navigate / search_content / scroll_to / read_aloud / switch_language / open_link / play_music / search_movies_tv. Whitelisted + Zod-validated.
- **Persona**: `system-prompt.ts` IS the product spec — Aksara speaks AS Yose, bilingual ID/EN, refuses off-scope requests.
- **Caps**: wind-down 150s, hard cutoff 180s (`gemini-live-client.ts:81-82`) — self-imposed and arbitrary.
- **Quota**: `quota.ts` — localStorage only (20 sessions/24h, 30s cooldown). Trivially bypassable; the real backstop must be server-side.

### ⚠️ Voice gotchas (load-bearing, easy to break)
- **Snapshot referential stability** (`voice-store.ts:48-80`): `getSnapshot()` MUST return a cached object rebuilt only on change. A fresh object per call → React "Maximum update depth exceeded" → component unmounts. Don't touch without understanding this.
- **Chimes fire at the store level** (`voice-store.ts:92-98`), never in components — else a double-mount during nav double-plays.
- **Tool navigation** uses `window.__astroNavigate` to keep the WS alive; the `location.assign` fallback kills the session mid-sentence (`gemini-live-client.ts:503`).
- **Session memory lives ONLY in the open WS** — a hard cutoff = blank slate on next connect. This is the "Aksara forgets after the cap" UX we're fixing (see Aksara v2).

## Verified Gemini facts (2026-06-28 — don't re-research)
- `gemini-3.1-flash-live-preview` is **free**. Supports `sessionResumption` (handles valid **2h** after termination), `goAway` (sent **60s** before close), `contextWindowCompression` (→ **unlimited** length; else 15-min audio-only cap).
- Limits: stable Flash ≈ **1,500 RPD** / 10 RPM / 250k TPM, but **preview SKUs are throttled tighter** — the real number is only in AI Studio (`aistudio.google.com/rate-limit`). Google's public rate-limit page no longer lists it.
- Key insight: session **length** burns tokens/TPM (per-minute, resets); session **count** (≈ token mints) burns the daily **RPD** wall. Longer sessions are cheap; many short ones are not.
- Google force-drops the WS ~every 10 min → reconnect-with-handle ONLY on `goAway`, never on a timer (more reconnects = more RPD spent).

## Current focus — Aksara v2 (decided 2026-06-28)
Goal: continuous, *remembering* sessions that don't forget after the cap + a graceful daily budget. Decisions: **invisible/continuous** + **KV budget server-side, memory client-first**.
1. **Security floor first**: Cloudflare rate-limit `/token` + `/tmdb/search`; stop echoing upstream error bodies (`worker/src/index.ts:64,123`).
2. **Resumption + compression**: add `sessionResumption` + `contextWindowCompression` to the `setup` frame, capture handles, reconnect on `goAway`. Redefine `pause()` = clean WS close (mic fully OFF) + resume via handle. Kills "forgets after cap" + "wedged after idle" bugs.
3. **KV budget + memory**: per-visitor daily budget (gate on conversation count, Aksara speaks in minutes) + cross-day rolling summary in Cloudflare KV. Within-2h continuity is free via the handle. **Keep** the genuine wind-down "heads up" message — it's a feature, not a bug.
4. Sequence the spike non-destructively behind the current cap before flipping to invisible.

## Known issues / quick wins (from the audit)
- ✅ RSS links 404 — FIXED (strip locale prefix from `post.id` in `rss.xml.ts` + `mind-garden/rss.xml.ts`).
- `gemini-live-client.ts:329` hardcodes `languageCode:'id-ID'` for all locales (revisit during voice work — interacts with bilingual design).
- `packages/pure/` (650K) DEAD — kept alive by one stale import `src/components/media/mediacard.astro:2`; repoint to `@yohn-maistre/astro-pure-fork/user` then delete the dir.
- `src/pages/media/index.astro:11` uses `Promise.all` → one flaky API fails the whole build; use `Promise.allSettled`.
- `src/pages/mind-garden/[...id].astro:14` EN route doesn't union ID entries (ID-only garden notes unreachable from EN tree).
- No tests anywhere; `check-i18n-parity.ts` + `generate-lqip.js` run in neither build nor CI.
- README misstates the stack and omits voice/i18n/bento — rewrite due.

## Conventions
- Reuse existing patterns; the theme exposes components via `@yohn-maistre/astro-pure-fork/{user,server}`.
- Env: `PUBLIC_TOKEN_ENDPOINT` (build, public — the Worker URL) · `TMDB_API_KEY` (build: media enrichment; also a Worker secret) · `GEMINI_API_KEY` (Worker secret ONLY — never ships to the client).
- Don't commit/push unless asked.
