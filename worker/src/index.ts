interface Env {
  GEMINI_API_KEY: string
  TMDB_API_KEY: string
  ALLOWED_ORIGIN: string
}

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
})

const json = (body: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

type ErrorKind = 'rate-limit' | 'quota' | 'auth' | 'upstream' | 'unknown'

interface ClassifiedError {
  kind: ErrorKind
  status: number
  message: string
  retryAfter?: number
}

/**
 * Maps an upstream Gemini auth_tokens failure to an ErrorKind + suggested
 * retryAfter (seconds). Gemini returns Retry-After as a header on 429
 * sometimes; other times it's in the JSON body under `error.details[].retryDelay`
 * formatted as "Ns".
 */
async function classifyUpstream(res: Response): Promise<ClassifiedError> {
  const status = res.status
  const text = await res.text()
  let retryAfter: number | undefined

  const header = res.headers.get('retry-after')
  if (header) {
    const n = Number.parseInt(header, 10)
    if (Number.isFinite(n)) retryAfter = n
  }

  if (retryAfter === undefined && text) {
    const m = text.match(/"retryDelay"\s*:\s*"(\d+)s"/)
    if (m) retryAfter = Number.parseInt(m[1], 10)
  }

  let kind: ErrorKind = 'unknown'
  if (status === 429) {
    kind = 'rate-limit'
    if (retryAfter === undefined) retryAfter = 60
  } else if (status === 403) {
    kind = /quota|limit/i.test(text) ? 'quota' : 'auth'
    if (kind === 'quota' && retryAfter === undefined) retryAfter = 60
  } else if (status === 401) {
    kind = 'auth'
  } else if (status >= 500) {
    kind = 'upstream'
  }

  return { kind, status, message: text.slice(0, 300), retryAfter }
}

async function mintEphemeralToken(env: Env): Promise<Response> {
  const now = Date.now()
  const expire_time = new Date(now + 30 * 60_000).toISOString()
  const new_session_expire_time = new Date(now + 60_000).toISOString()

  // Match the official google-gemini/gemini-live-api-examples server.py:
  // top-level AuthToken fields, no `config` wrapper, no model lock. The
  // earlier `live_connect_constraints` field was a Python-SDK abstraction
  // that doesn't exist on the REST AuthToken resource and was rejected
  // with "Invalid JSON payload received. Unknown name". The token stays
  // single-use + 30 min — security cost of dropping the model lock is
  // negligible for a portfolio.
  return fetch(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expire_time,
        new_session_expire_time,
      }),
    }
  )
}

async function searchTmdb(query: string, env: Env): Promise<unknown> {
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> }
  return (data.results ?? []).slice(0, 3).map((r: any) => ({
    title: r.title ?? r.name,
    type: r.media_type,
    year: String(r.release_date ?? r.first_air_date ?? '').slice(0, 4),
    overview: r.overview,
    rating: r.vote_average,
  }))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || 'https://yose.is-a.dev'
    const headers = cors(origin)
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    if (url.pathname === '/token' && request.method === 'POST') {
      try {
        const upstream = await mintEphemeralToken(env)
        if (!upstream.ok) {
          const err = await classifyUpstream(upstream)
          return json(
            { error: err.message, kind: err.kind, retryAfter: err.retryAfter },
            err.status === 429 ? 429 : 502,
            headers
          )
        }
        return json(await upstream.json(), 200, headers)
      } catch (e) {
        return json(
          { error: (e as Error).message, kind: 'upstream' as ErrorKind },
          502,
          headers
        )
      }
    }

    if (url.pathname === '/tmdb/search' && request.method === 'GET') {
      const q = url.searchParams.get('q')
      if (!q) return json({ error: 'missing q' }, 400, headers)
      try {
        return json(await searchTmdb(q, env), 200, headers)
      } catch (e) {
        return json({ error: (e as Error).message }, 500, headers)
      }
    }

    return new Response('Not found', { status: 404, headers })
  },
}
