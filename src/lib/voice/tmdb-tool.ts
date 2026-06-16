const TOKEN_ENDPOINT = import.meta.env.PUBLIC_TOKEN_ENDPOINT as string

export async function searchMoviesTv(query: string): Promise<unknown> {
  const url = new URL('/tmdb/search', TOKEN_ENDPOINT)
  url.searchParams.set('q', query)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB proxy ${res.status}`)
  return res.json()
}
