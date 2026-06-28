# Codebase ground truth — yose.is-a.dev (yose-portfolio)

> Generated 2026-06-28 against commit `aeb361c2` on branch `main`.
> Coverage: **read in full** — voice subsystem (`src/lib/voice/*`, `worker/src/index.ts`), core configs (`astro.config.ts`, `content.config.ts`, `site.config.ts`, `quota.ts`, `system-prompt.ts`), RSS/i18n entry points. **Sampled** — bento components, theme package internals (`packages/pure-fork`), media utils, content files (counted, not all read). Two cross-cutting Explore passes + one security/correctness review pass; all High findings adversarially verified against source.
> Code is the source of truth here; the README and inline comments are cross-checked, not trusted.

## 1. Snapshot

- **What it is**: A personal portfolio + blog at `yose.is-a.dev`, built on Astro 5. Its standout feature is **Aksara**, a real-time voice agent (Gemini Live API over WebSocket) that speaks *as* the site owner, plus a bilingual (English/Indonesian) content system, a bento-grid home dashboard, and a movies/books media shelf.
- **Primary languages**: TypeScript (123 `.ts`), Astro (122 `.astro`), TSX (27). · **Frameworks/runtimes**: Astro 5.14, React 19, Three.js 0.180 (`@react-three/fiber` + `drei`), UnoCSS (`preset-wind`), Zod, MiniSearch. · **Build system**: Bun runs pre-build scripts; Astro builds static output.
- **Shape**: static site + one Cloudflare Worker, in a quasi-monorepo (two vendored theme packages under `packages/`). ~180 first-party source files; flagship logic ~2k LOC in `src/lib/voice/`.
- **How it boots / builds / tests / ships**:
  - build = `bun run build` → `build:aksara-context` + `build:search-index` → `astro build` (`package.json:8-11`).
  - test = **none** — no test/spec/vitest files exist anywhere.
  - run (dev) = `astro dev` (`package.json:6`).
  - deploy = GitHub Pages via `peaceiris/actions-gh-pages@v3`, `output: 'static'`, CNAME `yose.is-a.dev` (`.github/workflows/deploy.yml:27-32`, `astro.config.ts:51`). The Worker deploys separately via `wrangler-action` on changes to `worker/**` (`.github/workflows/deploy-worker.yml`).
- **Entry points**: `astro.config.ts:28` (site config) · `src/pages/index.astro` (home) · `packages/pure-fork/index.ts:18` (theme integration) · `worker/src/index.ts:107` (Worker fetch handler).

## 2. Architecture and wiring map

```
                         ┌─────────────────────────── BUILD (Bun + Astro) ───────────────────────────┐
  src/content/**  ──►  build-aksara-context.ts ──► public/voice/aksara-context.json   (Aksara's RAG bundle)
  src/content/**  ──►  build-search-index.ts   ──► public/voice/search-index.json     (MiniSearch corpus)
  src/content/**  ──►  astro build (static)    ──► dist/  ──► GitHub Pages (yose.is-a.dev)
                         └───────────────────────────────────────────────────────────────────────────┘

  BROWSER (yose.is-a.dev)                                   CLOUDFLARE WORKER (yose-voice-agent)
  ┌─────────────────────────────────────┐                  ┌──────────────────────────────────────┐
  │ <VoiceAgent> (home bento tile)       │   POST /token    │ mintEphemeralToken() ── GEMINI_API_KEY │──► Google auth_tokens
  │ <AksaraCorner> (every other page)    │ ───────────────► │ classifyUpstream(429/403/401/5xx)      │
  │        │  both subscribe             │                  │ GET /tmdb/search ── TMDB_API_KEY       │──► api.themoviedb.org
  │        ▼                             │ �„ephemeral token                                          │
  │   voice-store.ts (module singleton)  │                  └──────────────────────────────────────┘
  │        │ owns                        │
  │        ▼                             │   wss + access_token
  │   GeminiLiveClient ─────────────────────────────────────────────────────────────────────────────► Gemini Live API
  │     mic → pcm-worklet → PCM16 b64 ──►│   realtimeInput (audio)                                       (BidiGenerate-
  │     �„ audio frames → playback ctx ──│   serverContent (audio) / toolCall                            ContentConstrained)
  │     tools (navigate/search/tmdb/…) ──│   toolResponse
  └─────────────────────────────────────┘
```

- **Layers / boundaries**: (1) build-time content pipeline → static JSON bundles; (2) Astro static pages + React islands; (3) the voice runtime (module-singleton store + WS client) that lives *outside* the React tree on purpose; (4) the Worker as the only server-side trust boundary (holds the real API keys).
- **Control flow (voice, end to end)**: click → `voiceStore.start()` (`voice-store.ts:136`) → `checkQuota()` gate (`quota.ts:79`) → `GeminiLiveClient.connect()` (`gemini-live-client.ts:134`) → `Promise.all([fetchToken(), loadAksaraContext()])` → `openSocket()` sends `setup` (`:319`) → `startCapture()` mic+worklet (`:418`) → `sendGreetingPrimer()` (`:402`) → `armSessionCaps()` (`:250`) → state `listening`. Audio frames in via `handleServer()` (`:456`); tool calls dispatched at `:490`.
- **Cross-cutting concerns**: *config* — `src/site.config.ts` + `virtual:pure-config` injected by the theme (`packages/pure-fork/plugins/virtual-user-config.ts`). *state* — the voice singleton (`voice-store.ts`), deliberately module-level so it survives Astro `ClientRouter` page swaps (`voice-store.ts:7-12`). *i18n* — manual EN/ID page-tree duplication + `getLangFromUrl` (`src/lib/i18n.ts:9`). *error handling* — per-tile try/catch in bento; `classifyError`/`classifyUpstream` for voice. *logging* — `console.*` only; no telemetry.
- **External dependencies/integrations**: Gemini Live API (via Worker token) · TMDB (via Worker proxy + build-time `getMediaDetails.ts`) · OpenLibrary (build-time book covers) · Lanyard (Discord presence, client) · last.fm (Spotify "now playing", client) · WakaTime public share JSON (client) · GitHub contributions API + `ghchart.rshah.org` (client/img).

## 3. Module-by-module ground truth

### Voice agent — `src/lib/voice/`, `worker/`, `src/components/{bento,aksara}/`
- **Responsibility**: real-time bilingual voice persona ("Aksara") that represents the owner, can search his content, navigate the site, and read pages aloud.
- **Key files**: `gemini-live-client.ts:65` — the WS client, audio I/O, session caps, tool dispatch. `voice-store.ts:41` — module-singleton state machine (7 states: `idle|connecting|listening|thinking|speaking|sleeping|error`, `:21`). `tools.ts` — 8 tools with Zod validation + navigate/open_link whitelists (`:152-191`). `system-prompt.ts:8` — the persona spec (the de-facto product doc). `quota.ts:79` — client-side session budget. `site-context.ts`/`build-aksara-context.ts` — the RAG bundle. `worker/src/index.ts:67` — ephemeral token minting + TMDB proxy.
- **How it is wired**: both `<VoiceAgent>` (home, `BentoGrid.astro`) and `<AksaraCorner>` (all other pages) subscribe to the same singleton via `useVoiceStore()`; chimes fire once at the store level so a double-mount during nav can't double-play (`voice-store.ts:92-98`). The store owns one `GeminiLiveClient`; the WS survives nav because module identity is stable across `astro:after-swap`.
- **Primitives/idioms**: `useSyncExternalStore` with a **cached snapshot** rebuilt only on change (`voice-store.ts:55,73`) — referential stability is load-bearing; returning a fresh object each call crashes React (documented `:48-54`). AudioWorklet downsampler emits 30 ms PCM16 chunks (`public/voice/pcm-worklet.js`). Tool results are piped back as `toolResponse` frames; `read_aloud` injects a synthetic `clientContent` turn (`tools.ts`, `gemini-live-client.ts:122`).
- **Notable patterns and smells**: session memory lives *only* in the open WS — a hard cutoff (`:264`) closes it and the next connect is a blank slate (the "forgets after the 3-min cap" UX). `languageCode` is hardcoded `'id-ID'` regardless of locale (`:329`). No mid-session reconnect/resumption — a transient WS close (codes 1008/1011/1013) drops to `sleeping` and waits for a manual click (`:377`). `msg.goAway` is logged but not acted on (`:485`). Pause keeps the WS open + mic muted-but-live (`:214`), which lingers a connection and leaves the browser recording indicator on.

### Content, i18n & routing — `src/content/`, `src/pages/`, `src/i18n/`, `src/lib/`
- **Responsibility**: two content collections (`blog`, `mind-garden`) rendered through a manually-duplicated EN (`/`) + ID (`/id/`) route tree.
- **Key files**: `src/content.config.ts:12,44` — Zod schemas (title ≤60, description ≤160, tags lowercased/deduped). `src/lib/i18n.ts:9-19` — `getLangFromUrl` + English-fallback `useTranslations`. `packages/pure-fork/utils/server.ts:62-100` — `stripLocaleFromId` + `getLocalePreferredCollection` (the union-with-fallback logic). `src/lib/content-mappings.ts:15` — one hardcoded slug map (`solarpunk`↔`solarpunk-id`). `scripts/check-i18n-parity.ts` — informational parity report, **not wired into CI**.
- **How it is wired**: blog `[...id].astro` builds the union of EN+ID slugs and falls back across locales with a `TranslationPendingBanner` (`src/pages/blog/[...id].astro:14`). The home/list pages use `getLocalePreferredCollection`.
- **Primitives/idioms**: glob content loader; entry `id` carries the locale prefix (`en/…`, `id/…`); locale is parsed from the path segment, not Astro middleware.
- **Notable patterns and smells**: EN `mind-garden/[...id].astro` queries **only** `en` (`:14`), so ID-only garden notes are unreachable from the EN tree (currently 1 such note). `/media/[media]/[...page]` exists in EN but not ID (parity gap). `/id/search/index.astro:26` has a hardcoded English empty-state string. Heavy duplication between the two page trees with no enforcement.

### Theme + build + styling — `packages/pure-fork/`, `uno.config.ts`, `scripts/`
- **Responsibility**: a vendored fork of `astro-theme-pure` providing layout components, markdown plugins, virtual config modules, and search.
- **Key files**: `packages/pure-fork/index.ts:18` — the integration (injects MDX/sitemap/UnoCSS, remark/rehype plugins, runs pagefind at `astro:build:done`). `uno.config.ts` — prose/typography + HSL CSS-var theme. `scripts/build-aksara-context.ts` + `build-search-index.ts` — emit `public/voice/*.json`. `scripts/generate-lqip.js` — blur placeholders.
- **Notable patterns and smells**: `packages/pure` (the **original** theme, 650 KB) is dead — referenced by exactly one stale import, `src/components/media/mediacard.astro:2` (`../../../packages/pure/components/user`); everything else imports `@yohn-maistre/astro-pure-fork`. Repoint that one line and the whole dir is deletable. `generate-lqip.js` and `check-i18n-parity.ts` exist but run in neither the build nor CI. `astro.config.ts:42-50` carries commented-out Vercel/node adapter scaffolding; `@astrojs/vercel` is still a dependency though `output:'static'` ships to GitHub Pages.

### Bento dashboard + media — `src/components/bento/`, `src/components/media/`, `src/utils/`
- **Responsibility**: the home "dashboard" tiles and a movies/books shelf enriched at build time.
- **Key files**: `BentoGrid.astro` (grid + hydration strategy) · `DiscordPresence.tsx` (Lanyard) · `SpotifyPresence.tsx` (last.fm; also publishes `window.__yose_spotify_now_playing` for the voice `play_music` tool) · `WakatimeGraph.tsx` · `GithubCalendar.tsx` · `HousePostCanvas.tsx`/`ThreeCanvas.tsx` (GLB via DRACO) · `src/utils/getMediaDetails.ts:42` (TMDB) `:64` (OpenLibrary).
- **Notable patterns and smells**: each tile fails soft with inline error copy (good). `src/pages/media/index.astro:11` enriches via `Promise.all` — one rejected lookup fails the whole build; should be `Promise.allSettled`. External IDs/URLs hardcoded in `src/consts.ts:48-55`.

## 4. Doc direction vs. reality

| Doc claim / stated intent | Source | Reality in code | Verdict |
|---|---|---|---|
| Tech stack is "Astro, React, Three.js, **Spline**, **Tailwind CSS**" | `README.md:11-15` | UnoCSS (`@unocss/preset-wind`, `uno.config.ts`); **no Spline** dependency anywhere; Three.js present | **drifted** (Spline dead, Tailwind→UnoCSS) |
| "showcase projects, blog posts, info about myself" | `README.md:7` | True, but omits the entire voice agent, i18n EN/ID, bento dashboard, mind-garden, media shelf | **stale/incomplete** |
| "built with astro-theme-pure" (links upstream) | `README.md:19` | Built on a local **fork** `@yohn-maistre/astro-pure-fork`; upstream `packages/pure` is vendored but dead | **drifted** |
| Vercel adapter (serverless/static) | `astro.config.ts:42-50` (commented) | `output:'static'` → GitHub Pages; `@astrojs/vercel` dep unused; `clean` script still `rm -rf .vercel` | **abandoned scaffolding** |
| i18n parity is enforced | `scripts/check-i18n-parity.ts` + `package.json:22` | Script is informational only and absent from CI | **aspirational** |
| Aksara persona spec | `src/lib/voice/system-prompt.ts:8-95` | This *is* the real product spec; it exists nowhere in the docs | **undocumented behaviour** |

- **Stated direction**: the README frames a conventional portfolio; the *code's* center of gravity has shifted to the voice agent + bilingual content, which the docs never mention.
- **Drift**: README tech list is wrong on two of five items; "astro-theme-pure" is now a fork.
- **Undocumented behaviour**: the voice agent, its quota/cap design, the EN/ID fallback model, and the Worker contract are all real and load-bearing but undocumented outside code comments.
- **Abandoned/scaffolded**: Vercel adapter; LQIP script; i18n-parity check; `packages/pure`.
- **Contradictions**: none between docs (there's essentially one doc); the contradictions are doc-vs-code.

## 5. Code review findings

> Coverage note: dimensions reviewed = security, correctness, performance/resource lifecycle, maintainability/dead-code, i18n correctness, supply-chain (deps). Skipped = automated test quality (none exist), accessibility deep-audit (spot-checked only: reduced-motion is handled in `chimes.ts`/`AksaraHint.tsx`).

### Critical / High
- **[CRITICAL] Unauthenticated token-mint endpoint drains the free tier** — `worker/src/index.ts:117`. What: `POST /token` mints a Gemini ephemeral token for anyone; CORS only sets a response header, it does not gate who can call it. Why: each call spends against the 10 RPM / 1500 RPD budget; the client `quota.ts` gate is localStorage-only and self-documents its bypass (`?aksara-reset=1`, `localStorage.removeItem`). A trivial `fetch` loop exhausts the day's budget for all visitors. Fix: add Cloudflare rate-limiting per IP on `/token`, and move the per-visitor/day budget server-side (KV/Durable Object). This is the single most important issue.
- **[CRITICAL] Unauthenticated TMDB proxy** — `worker/src/index.ts:138`. What: `GET /tmdb/search?q=` proxies to TMDB with no rate limit/auth. Why: same abuse/cost surface as above, plus TMDB quota. Fix: Cloudflare rate-limit + short-TTL KV cache of queries.
- **[HIGH] RSS feed links 404 (verified)** — `src/pages/rss.xml.ts:76`, `src/pages/mind-garden/rss.xml.ts:73`. What: `link: /blog/${post.id}` and `/mind-garden/${post.id}` where `post.id` includes the locale prefix (`en/solarpunk`), producing `/blog/en/solarpunk`. The real route strips the prefix (`stripLocaleFromId`) → actual URL is `/blog/solarpunk`. So **every** EN feed link is broken, including EN-only posts. Fix: `post.id.replace(/^(en|id)\//, '')` when building `link` (the `/id/*` feeds already strip `id/`).

### Medium
- **[MED] `languageCode` hardcoded `'id-ID'`** — `gemini-live-client.ts:329`. What: TTS speech config is always Indonesian regardless of `ctxLang`. Why: English visitors get an Indonesian voice profile. Fix: `languageCode: this.ctxLang === 'en' ? 'en-US' : 'id-ID'`.
- **[MED] No mid-session resumption/reconnect** — `gemini-live-client.ts:264,377,485`. What: hard cutoff closes the WS and loses all context; transient closes drop to `sleeping`; `goAway` is ignored. Why: the "Aksara forgets after the cap" and "wedged after an idle drop" UX. Fix: adopt Gemini Live **session-resumption handles** (see §7/§8).
- **[MED] Media enrichment uses `Promise.all`** — `src/pages/media/index.astro:11`. What: one failed TMDB/OpenLibrary lookup rejects the whole build. Fix: `Promise.allSettled` + skip failed items.
- **[MED] Silent connect failure** — `voice-store.ts:207-211`. What: `catch {}` nulls the client without logging; can leave state inconsistent if `onError` didn't fire. Fix: log and ensure an error state is surfaced.
- **[MED] Worker echoes upstream body in errors** — `worker/src/index.ts:64,123`. What: returns `text.slice(0,300)` of Gemini's error to the client. Why: low leak risk today (Gemini won't echo the key) but it's an uncontrolled passthrough. Fix: parse and return only `{kind,error}` safe fields.

### Low / Nits
- `src/components/media/mediacard.astro:2` — stale import keeps the dead 650 KB `packages/pure/` alive; repoint to `@yohn-maistre/astro-pure-fork/user` and delete the dir.
- `src/pages/mind-garden/[...id].astro:14` — EN route doesn't union ID entries (ID-only garden notes unreachable from `/mind-garden/`).
- `src/pages/id/search/index.astro:26` — hardcoded English empty-state string in the ID page.
- `src/components/projects/ProjectSection.astro:80` — `set:html={project.description}`: **safe today** (descriptions are hardcoded in `src/pages/projects/index.astro:39`), but the pattern is XSS-shaped if the source ever becomes dynamic.
- No tests anywhere; `check-i18n-parity.ts` and `generate-lqip.js` run in neither build nor CI.
- `@astrojs/vercel` is an unused dependency; commented adapter scaffolding in `astro.config.ts`.

## 6. Immediate fixes (quick wins)

| # | Fix | Where | Effort | Why it matters |
|---|---|---|---|---|
| 1 | Strip locale prefix from RSS `link` | `rss.xml.ts:76`, `mind-garden/rss.xml.ts:73` | S | Every EN feed link currently 404s |
| 2 | Locale-aware `languageCode` | `gemini-live-client.ts:329` | S | EN visitors get the right voice profile |
| 3 | Add Cloudflare rate-limit rules to `/token` + `/tmdb/search` | Worker dashboard / `wrangler.toml` | S | Caps the cost-drain attack surface before the bigger budget work |
| 4 | `Promise.allSettled` for media enrichment | `media/index.astro:11` | S | One flaky API call stops failing the whole deploy |
| 5 | Repoint `mediacard` import, delete `packages/pure/` | `mediacard.astro:2` | S | Removes 650 KB of dead duplicate code |
| 6 | Log in the connect `catch` | `voice-store.ts:208` | S | Debuggability of session failures |
| 7 | Act on `goAway` (start a clean reconnect) | `gemini-live-client.ts:485` | S–M | First step toward seamless long sessions |

## 7. Areas of improvement

- **Server-side voice budget + memory (the linchpin)** — problem: budget enforcement and "memory" are both client-side or nonexistent; the Worker is the only real trust boundary but holds no state. direction: a Cloudflare KV/Durable Object keyed by an anonymous visitor id (localStorage UUID) that holds (a) cumulative seconds used today and (b) a short rolling conversation summary. The Worker returns both alongside the token. payoff: closes the CRITICAL abuse hole *and* unlocks "welcome back" memory in one stroke.
- **Session continuity via resumption handles** — problem: the 3-min WS recycle is visible and amnesiac; pause keeps a live mic+socket. direction: use Gemini Live session-resumption handles so reconnects restore context; redefine pause as "close WS, keep handle." payoff: fixes both reported bugs (amnesia after cap; wedged/idle-drop), frees connections, and turns the mic fully off when paused.
- **Kill the EN/ID duplication risk** — problem: two hand-maintained page trees with no enforcement; parity gaps already exist. direction: wire `check-i18n-parity.ts` into CI (warn, then fail), and/or collapse shared pages into locale-parameterized routes. payoff: stops silent parity rot.
- **Make the build self-verifying** — problem: no tests, LQIP/parity scripts unwired. direction: a handful of unit tests on the pure-logic seams (`stripLocaleFromId`, `checkQuota`, RSS link building, `classifyUpstream`) + run LQIP/parity in CI. payoff: cheap guardrails on the exact spots that already had bugs.
- **Refresh the README** — problem: it misstates the stack and omits the headline feature. direction: rewrite to reflect Astro+UnoCSS+voice+i18n; drop Spline/Tailwind. payoff: the repo stops lying about itself.

## 8. Roadmap / implementation plan

1. **Phase 0 — Quick wins (S)**: ship §6 items 1–6. Independent, low-risk, removes the broken RSS links, the dead package, and the easy voice nits. Depends on: nothing.
2. **Phase 1 — Cap the abuse surface (S–M)**: Cloudflare rate-limiting on both Worker routes; tighten error passthrough. Depends on: Cloudflare config access. This is the security floor before raising session limits.
3. **Phase 2 — Session resumption + redefined pause (M)**: add `sessionResumption` + `contextWindowCompression` to the `setup` frame, capture `sessionResumptionUpdate` handles, act on `goAway` (sent 60s before close), and reconnect-with-handle. Redefine pause to fully close the WS and resume from the handle. **Confirmed supported on `gemini-3.1-flash-live-preview`** (docs, verified 2026-06-28): resumption handles valid 2h after termination; compression lifts the 15-min audio ceiling to unlimited. Reconnect ONLY reactively on `goAway` (Google force-drops the WS ~every 10 min) — never on an arbitrary timer (more reconnects = more token mints = more RPD spent). Depends on: Phase 1.
4. **Phase 3 — Server-side budget + lightweight memory (M–L)**: Worker-side per-visitor/day budget in KV (replaces the bypassable client quota as the *enforcement* layer; keep the client gate as a fast UX hint). Store a rolling summary; inject "[returning visitor — last time …]" on connect; teach the system prompt to say "come back tomorrow, I'll remember you." Depends on: Phase 1 + 2.
5. **Phase 4 — Guardrails + docs (S–M)**: unit tests on the logic seams; wire LQIP + i18n-parity into CI; rewrite the README. Depends on: nothing, can run in parallel.

## 9. Open questions and unknowns

- ~~Exact session-resumption + context-compression support for `gemini-3.1-flash-live-preview`~~ → **RESOLVED (2026-06-28)**: docs confirm `sessionResumption`, `goAway` (60s warning), and `contextWindowCompression` (→ unlimited length) are all supported on this model; resumption tokens valid 2h. Audio I/O spec (16kHz in / 24kHz PCM out) already matches the code. Remaining unknown: the exact **preview-tier RPD** — preview SKUs are throttled below stable Flash's 1,500 RPD; the real per-project number is only visible in the owner's AI Studio dashboard (`aistudio.google.com/rate-limit`). The client `quota.ts:3` comment ("10 RPM / 1500 RPD") reflects stable Flash, not necessarily this preview SKU.
- Whether `window.__astroNavigate` is reliably set by the layout before a tool calls it → resolve by: grep/trace in `BaseLayout.astro` (tool nav falls back to a full reload that kills the WS if missing — `gemini-live-client.ts:503`).
- Real-world frequency of the "can't restart after idle/cap" state the owner reports → resolve by: add the `console` logging in §6.6 and reproduce; the recent commits (`69dfef58`) already patched one WS-died-during-pause path.
- Is `public/lqip/*` consumed at runtime anywhere, or fully orphaned → resolve by: grep for the manifest path in components.
