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

async function mintEphemeralToken(env: Env): Promise<unknown> {
  const now = Date.now()
  const expireTime = new Date(now + 30 * 60_000).toISOString()
  const newSessionExpireTime = new Date(now + 5 * 60_000).toISOString()

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model: 'models/gemini-3.1-flash-live-preview',
            // Fallback if 3.1 misbehaves:
            // model: 'models/gemini-live-2.5-flash-native-audio',
          },
        },
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Gemini auth_tokens ${res.status}: ${await res.text()}`)
  }

  return res.json()
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
        return json(await mintEphemeralToken(env), 200, headers)
      } catch (e) {
        return json({ error: (e as Error).message }, 500, headers)
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
