/*
 * Runtime BM25 search over the static index built by
 * scripts/build-search-index.ts. v1 is keyword-only (MiniSearch). A
 * future revision can blend in precomputed Gemini embeddings via RRF —
 * the index already has a `body` field large enough to embed against.
 */

import MiniSearch from 'minisearch'

const INDEX_URL = '/voice/search-index.json'

export interface SearchDoc {
  id: string
  kind: 'blog' | 'garden' | 'project'
  lang: 'en' | 'id'
  slug: string
  title: string
  description?: string
  date?: string
  tags: string[]
  url: string
  summary: string
  body: string
}

interface IndexFile {
  version: number
  generated_at: string
  docs: SearchDoc[]
}

interface SearchOpts {
  kind?: 'blog' | 'garden' | 'project' | 'any'
  /** If set, prefer matches in this lang; matches in the other lang are demoted. */
  preferLang?: 'en' | 'id'
  limit?: number
}

export interface SearchHit {
  id: string
  kind: SearchDoc['kind']
  lang: SearchDoc['lang']
  title: string
  url: string
  summary: string
  date?: string
  tags: string[]
  score: number
}

let cached: { index: MiniSearch; docs: Map<string, SearchDoc> } | null | undefined

async function load(): Promise<typeof cached> {
  if (cached !== undefined) return cached
  try {
    const res = await fetch(INDEX_URL, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const file = (await res.json()) as IndexFile
    const docs = new Map(file.docs.map((d) => [d.id, d]))
    const index = new MiniSearch<SearchDoc>({
      idField: 'id',
      fields: ['title', 'description', 'tags', 'body', 'summary'],
      storeFields: [],
      searchOptions: {
        boost: { title: 3, description: 2, tags: 2 },
        prefix: true,
        fuzzy: 0.2
      }
    })
    index.addAll(file.docs)
    cached = { index, docs }
    return cached
  } catch (e) {
    console.warn('[search] failed to load index', e)
    cached = null
    return null
  }
}

export async function searchContent(
  query: string,
  opts: SearchOpts = {}
): Promise<SearchHit[]> {
  const loaded = await load()
  if (!loaded) return []
  const limit = opts.limit ?? 5
  const kind = opts.kind && opts.kind !== 'any' ? opts.kind : undefined

  const results = loaded.index.search(query)
  const hits: SearchHit[] = []
  for (const r of results) {
    const doc = loaded.docs.get(String(r.id))
    if (!doc) continue
    if (kind && doc.kind !== kind) continue
    let score = r.score
    if (opts.preferLang && doc.lang !== opts.preferLang) score *= 0.6
    hits.push({
      id: doc.id,
      kind: doc.kind,
      lang: doc.lang,
      title: doc.title,
      url: doc.url,
      summary: doc.summary,
      date: doc.date,
      tags: doc.tags,
      score
    })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
