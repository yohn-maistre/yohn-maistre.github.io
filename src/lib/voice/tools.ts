/*
 * Aksara's tools — Zod schemas + handlers + a hand-authored Gemini
 * Live functionDeclarations array. Kept side-by-side instead of using
 * zod-to-json-schema because Gemini's tool schema is a small uppercase
 * dialect (TYPE, OBJECT, STRING) and we only have ~7 tools.
 */

import { z } from 'zod'

import { searchContent } from './search'

/**
 * Anything Aksara's tools need from the host page lives here. The
 * GeminiLiveClient owns this and re-injects current pathname/lang each
 * time a tool fires so tools always see live state.
 */
export interface ToolContext {
  lang: 'en' | 'id'
  pathname: string
  navigate: (path: string) => void
  toast?: (msg: string) => void
  /** Inject a synthetic clientContent turn telling Aksara to respond with the given text. */
  injectSystemTurn: (text: string) => void
}

// JSON-serializable response. Kept loose so handlers can return wide unions
// without TS narrowing them past usefulness.
type ToolResult = Record<string, unknown>

interface ToolDef<S extends z.ZodTypeAny> {
  schema: S
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolResult> | ToolResult
}

/* ---------- schemas ---------- */
const NavigateSchema = z.object({
  route: z.string().describe('Path like /blog or /id/projects, or full URL.')
})

const SearchSchema = z.object({
  query: z.string().min(1).describe('Search query — keywords or short phrase'),
  kind: z
    .enum(['blog', 'garden', 'project', 'any'])
    .default('any')
    .describe('Restrict to one content type or search everything'),
  limit: z.number().int().min(1).max(8).optional().default(5)
})

const ScrollSchema = z.object({
  heading: z.string().describe('Visible heading text on the current page')
})

const ReadAloudSchema = z.object({
  from_heading: z.string().optional().describe('Optional heading to start reading from'),
  max_words: z.number().int().min(20).max(800).optional().default(300)
})

const SwitchLangSchema = z.object({})

const OpenLinkSchema = z.object({
  url: z.string().url(),
  reason: z.string().describe('One-line user-facing reason for opening this link')
})

const PlayMusicSchema = z.object({})

/* ---------- helpers ---------- */
function findHeading(text: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const target = norm(text)
  // Exact, then includes, then starts-with.
  return (
    (headings.find((h) => norm(h.textContent ?? '') === target) as HTMLElement | undefined) ??
    (headings.find((h) => norm(h.textContent ?? '').includes(target)) as HTMLElement | undefined) ??
    (headings.find((h) => norm(h.textContent ?? '').startsWith(target)) as HTMLElement | undefined) ??
    null
  )
}

function extractMainText(maxWords: number, fromHeading?: string): string {
  if (typeof document === 'undefined') return ''
  const root = document.querySelector('main, article') ?? document.body
  let start: HTMLElement | null = root as HTMLElement
  if (fromHeading) {
    const h = findHeading(fromHeading)
    if (h) start = h
  }
  const tw = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement
      if (!el) return NodeFilter.FILTER_REJECT
      const tag = el.tagName
      if (['SCRIPT', 'STYLE', 'NAV', 'ASIDE', 'CODE', 'PRE', 'FIGCAPTION'].includes(tag)) {
        return NodeFilter.FILTER_REJECT
      }
      if (!(node.nodeValue ?? '').trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const parts: string[] = []
  let words = 0
  while (tw.nextNode()) {
    const t = (tw.currentNode.nodeValue ?? '').replace(/\s+/g, ' ').trim()
    if (!t) continue
    parts.push(t)
    words += t.split(' ').length
    if (words >= maxWords) break
  }
  return parts.join(' ').slice(0, maxWords * 8) // safety char cap
}

function toggleLocale(pathname: string): { next: string; newLang: 'en' | 'id' } {
  if (pathname.startsWith('/id')) {
    const stripped = pathname.replace(/^\/id/, '') || '/'
    return { next: stripped, newLang: 'en' }
  }
  return { next: '/id' + pathname, newLang: 'id' }
}

function isAllowedExternal(url: string): boolean {
  try {
    const u = new URL(url)
    const allowed = [
      'github.com',
      'x.com',
      'twitter.com',
      'threads.net',
      'open.spotify.com',
      't.me',
      'steamcommunity.com',
      'abstraksi.io',
      'abstraksi.id',
      'yose.is-a.dev'
    ]
    return allowed.some((host) => u.hostname === host || u.hostname.endsWith('.' + host))
  } catch {
    return false
  }
}

/* ---------- tool registry ---------- */
export const tools = {
  navigate: {
    schema: NavigateSchema,
    handler: ({ route }, ctx) => {
      ctx.navigate(route)
      return { ok: true, currentPath: route }
    }
  } satisfies ToolDef<typeof NavigateSchema>,

  search_content: {
    schema: SearchSchema,
    handler: async ({ query, kind, limit }, ctx) => {
      const hits = await searchContent(query, {
        kind,
        preferLang: ctx.lang,
        limit
      })
      return {
        hits: hits.map((h) => ({
          title: h.title,
          url: h.url,
          kind: h.kind,
          lang: h.lang,
          date: h.date ?? null,
          summary: h.summary
        }))
      }
    }
  } satisfies ToolDef<typeof SearchSchema>,

  scroll_to: {
    schema: ScrollSchema,
    handler: ({ heading }) => {
      const target = findHeading(heading)
      if (!target) return { ok: false, reason: 'heading not found' }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return { ok: true, scrolledTo: target.textContent?.slice(0, 80) ?? '' }
    }
  } satisfies ToolDef<typeof ScrollSchema>,

  read_aloud: {
    schema: ReadAloudSchema,
    handler: ({ from_heading, max_words }, ctx) => {
      const text = extractMainText(max_words ?? 300, from_heading)
      if (!text) return { ok: false, reason: 'no main content found' }
      ctx.injectSystemTurn(
        `[Yose's site asks you to read the following passage aloud, in the same language as the user. Don't editorialize, just read it warmly and naturally.]\n\n${text}`
      )
      return { ok: true, words: text.split(/\s+/).length }
    }
  } satisfies ToolDef<typeof ReadAloudSchema>,

  switch_language: {
    schema: SwitchLangSchema,
    handler: (_, ctx) => {
      const { next, newLang } = toggleLocale(ctx.pathname)
      ctx.navigate(next)
      return { ok: true, newLang, newPath: next }
    }
  } satisfies ToolDef<typeof SwitchLangSchema>,

  open_link: {
    schema: OpenLinkSchema,
    handler: ({ url, reason }, ctx) => {
      if (!isAllowedExternal(url)) {
        return { ok: false, reason: 'url not on Yose\'s allowlist' }
      }
      ctx.toast?.(reason)
      window.open(url, '_blank', 'noopener,noreferrer')
      return { ok: true }
    }
  } satisfies ToolDef<typeof OpenLinkSchema>,

  play_music: {
    schema: PlayMusicSchema,
    handler: () => {
      // Spotify Web Playback SDK would require Premium + login. For now
      // surface the current track URL if SpotifyPresence published one.
      const track = (window as any).__yose_spotify_now_playing as
        | { url?: string; title?: string; artist?: string }
        | undefined
      if (!track?.url) return { ok: false, reason: 'nothing playing' }
      window.open(track.url, '_blank', 'noopener,noreferrer')
      return { ok: true, title: track.title ?? null, artist: track.artist ?? null }
    }
  } satisfies ToolDef<typeof PlayMusicSchema>
} as const

export type ToolName = keyof typeof tools

/**
 * Gemini Live function declarations — hand-authored to match the Zod
 * schemas above. When you add a new tool, add it both here and to the
 * `tools` registry; the dispatcher will fail loudly if Gemini calls a
 * name we don't have.
 */
export const AKSARA_GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'navigate',
        description:
          "Navigate the user to a page on Yose's site. Use whenever the user asks to go somewhere, " +
          "or when you want to show them something to back up your answer. Examples of routes: " +
          "'/', '/blog', '/projects', '/mind-garden', '/about', '/id/blog', '/id/projects', etc.",
        parameters: {
          type: 'OBJECT',
          properties: { route: { type: 'STRING', description: 'Path like /blog or /id/projects' } },
          required: ['route']
        }
      },
      {
        name: 'search_content',
        description:
          "Search Yose's blog, mind garden, or project list by keyword or intent. Returns up to " +
          "5 hits, each with title, URL, language, date, and summary. Use whenever the user asks " +
          "about something Yose has written or built.",
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING' },
            kind: {
              type: 'STRING',
              description: "One of 'blog', 'garden', 'project', or 'any'",
              enum: ['blog', 'garden', 'project', 'any']
            },
            limit: { type: 'NUMBER' }
          },
          required: ['query']
        }
      },
      {
        name: 'scroll_to',
        description:
          "Scroll the current page to a heading by its visible text. Use when the user asks to " +
          "jump to a section. Match is fuzzy — partial text works.",
        parameters: {
          type: 'OBJECT',
          properties: { heading: { type: 'STRING' } },
          required: ['heading']
        }
      },
      {
        name: 'read_aloud',
        description:
          "Read the main content of the current page aloud. Triggers when the user asks you to " +
          "read the page to them. Optional from_heading starts reading from a specific section.",
        parameters: {
          type: 'OBJECT',
          properties: {
            from_heading: { type: 'STRING' },
            max_words: { type: 'NUMBER' }
          }
        }
      },
      {
        name: 'switch_language',
        description:
          'Toggle the site between English and Bahasa Indonesia, preserving the current page. ' +
          'Use when the user explicitly asks to switch the site UI language.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'open_link',
        description:
          "Open an external URL in a new tab. Only use for Yose's allowlisted hosts: github.com, " +
          "x.com, threads.net, open.spotify.com, t.me, steamcommunity.com, abstraksi.{io,id}, " +
          "yose.is-a.dev. Provide a short reason; the UI shows it as a toast.",
        parameters: {
          type: 'OBJECT',
          properties: {
            url: { type: 'STRING' },
            reason: { type: 'STRING' }
          },
          required: ['url', 'reason']
        }
      },
      {
        name: 'play_music',
        description:
          "Open the currently-playing Spotify track from Yose's status bar in a new tab. Use when " +
          "the user asks what Yose is listening to and wants to play it.",
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'search_movies_tv',
        description:
          "Search TMDB for a movie or TV show by title. Use when the user asks about media — " +
          "Yose's taste, a film he mentioned, or a new release. Returns the top 3 results with " +
          'title, type, year, overview, and rating.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Movie or TV show title to search for.' }
          },
          required: ['query']
        }
      }
    ]
  }
]

/* ---------- dispatcher ---------- */
export async function runTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  const registry = tools as unknown as Record<string, ToolDef<z.ZodTypeAny> | undefined>
  const tool = registry[name]
  if (!tool) return { error: `unknown tool: ${name}` }
  const parsed = tool.schema.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return { error: 'invalid args', details: parsed.error.message }
  }
  try {
    return await tool.handler(parsed.data, ctx)
  } catch (e) {
    return { error: (e as Error).message }
  }
}
