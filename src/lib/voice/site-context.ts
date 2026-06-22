/*
 * Loads + formats the Aksara context bundle for inclusion in the live
 * session's systemInstruction. Bundle is built at deploy time by
 * scripts/build-aksara-context.ts and served as a static asset.
 *
 * Fails open: if the fetch dies, we return null and the agent runs on
 * persona alone.
 */

const BUNDLE_URL = '/voice/aksara-context.json'

interface Entry {
  slug: string
  lang: 'en' | 'id'
  title: string
  description?: string
  date?: string
  tags: string[]
  excerpt: string
}

interface Bundle {
  generated_at: string
  site: { url: string; title: string }
  bio_md: string
  tech_stack: Record<string, readonly string[]>
  socials: Array<{ label: string; href: string }>
  projects: Array<{ name: string; category: string; description: string; url?: string }>
  blog: Entry[]
  mind_garden: Entry[]
}

let cached: Bundle | null | undefined

export async function loadAksaraContext(): Promise<Bundle | null> {
  if (cached !== undefined) return cached
  try {
    const res = await fetch(BUNDLE_URL, { cache: 'force-cache' })
    if (!res.ok) {
      console.warn('[aksara-context] fetch failed', res.status)
      cached = null
      return null
    }
    cached = (await res.json()) as Bundle
    return cached
  } catch (e) {
    console.warn('[aksara-context] fetch error', e)
    cached = null
    return null
  }
}

export function formatBundleForPrompt(b: Bundle): string {
  const lines: string[] = []
  lines.push('--- Yose context (auto-generated, do not quote verbatim) ---')
  lines.push(`Site: ${b.site.title} (${b.site.url})`)
  if (b.bio_md.trim()) {
    lines.push('')
    lines.push('## Bio (Yose-authored, treat as authoritative)')
    lines.push(b.bio_md.replace(/<!--[\s\S]*?-->/g, '').trim())
  }
  lines.push('')
  lines.push('## Tech stack')
  for (const [k, v] of Object.entries(b.tech_stack)) {
    lines.push(`- ${k}: ${v.join(', ')}`)
  }
  lines.push('')
  lines.push('## Projects')
  for (const p of b.projects) {
    lines.push(`- ${p.name} (${p.category}) — ${p.description}${p.url ? ` [${p.url}]` : ''}`)
  }
  lines.push('')
  lines.push('## Socials')
  for (const s of b.socials) lines.push(`- ${s.label}: ${s.href}`)
  lines.push('')
  lines.push('## Recent blog posts')
  for (const p of b.blog) {
    const lang = p.lang === 'id' ? '[ID]' : '[EN]'
    lines.push(`- ${lang} ${p.title}${p.date ? ` (${p.date.slice(0, 10)})` : ''}`)
    if (p.description) lines.push(`  ${p.description}`)
    lines.push(`  ${p.excerpt.slice(0, 280)}`)
  }
  if (b.mind_garden.length) {
    lines.push('')
    lines.push('## Mind garden notes')
    for (const p of b.mind_garden) {
      const lang = p.lang === 'id' ? '[ID]' : '[EN]'
      lines.push(`- ${lang} ${p.title}`)
      if (p.description) lines.push(`  ${p.description}`)
    }
  }
  lines.push('')
  lines.push('--- end Yose context ---')
  return lines.join('\n')
}

export function buildSessionStartHint(opts: { lang: 'en' | 'id'; hour: number }): string {
  return `[session start — locale=${opts.lang}, hour=${opts.hour}, greet now]`
}
