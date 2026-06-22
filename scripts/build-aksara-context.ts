/*
 * Builds public/voice/aksara-context.json — the bundle Aksara fetches
 * at session start so she actually knows Yose's work. Runs before
 * `astro build` (see package.json#scripts.build).
 *
 * No content-collection API here — we walk the filesystem directly so
 * the script can run standalone with `bun` before Astro initializes.
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import { TECH_STACK } from '../src/consts/tech-stack'
import { SOCIAL_LINKS, SITE } from '../src/consts'

const ROOT = process.cwd()
const OUT = join(ROOT, 'public/voice/aksara-context.json')
const BIO_PATH = join(ROOT, 'src/data/aksara-bio.md')
const BLOG_DIR = join(ROOT, 'src/content/blog')
const GARDEN_DIR = join(ROOT, 'src/content/mind-garden')

const MAX_POSTS = 20
const MAX_GARDEN = 20
const EXCERPT_WORDS = 120

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
  tech_stack: typeof TECH_STACK
  socials: Array<{ label: string; href: string }>
  projects: Array<{ name: string; category: string; description: string; url?: string }>
  blog: Entry[]
  mind_garden: Entry[]
}

const PROJECTS: Bundle['projects'] = [
  {
    name: 'Aksara',
    category: 'Voice & AI',
    description:
      'Autonomous AI agent platform that provides on-demand digital experts for complex cognitive tasks. The voice you are talking to is itself a small slice of this project.',
    url: 'https://github.com/yohn-maistre/aksara'
  },
  {
    name: 'Philo-Fight-Club-AI',
    category: 'Voice & AI',
    description:
      "Voice-interactive debate platform where you challenge history's greatest philosophers through real-time AI conversations.",
    url: 'https://github.com/yohn-maistre/philo-fight-club-ai'
  },
  {
    name: 'Respiratory-Diseases-Classifier',
    category: 'Data Science & ML',
    description:
      'Streamlit web app that classifies pulmonary diseases from respiratory sound recordings (.wav).',
    url: 'https://github.com/yohn-maistre/respiratory-diseases-classifier'
  },
  {
    name: 'HN-Webhook',
    category: 'Web & Automation',
    description: 'Discord webhook for fetching the top + best 10 Hacker News stories.',
    url: 'https://github.com/yohn-maistre/hn-webhook'
  },
  {
    name: 'yohn-maistre.github.io',
    category: 'Personal',
    description: 'This portfolio — Astro 5, bilingual, with a voice agent (hi).',
    url: 'https://github.com/yohn-maistre/yohn-maistre.github.io'
  }
]

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return { data: {}, content: raw }
  const data: Record<string, unknown> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const rawVal = line.slice(idx + 1).trim()
    if (!rawVal) continue
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      data[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      data[key] = rawVal.replace(/^['"]|['"]$/g, '')
    }
  }
  return { data, content: m[2] }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function excerptOf(md: string, words = EXCERPT_WORDS): string {
  const plain = stripMarkdown(md)
  const tokens = plain.split(/\s+/)
  if (tokens.length <= words) return plain
  return tokens.slice(0, words).join(' ') + '…'
}

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(full)))
    else if (/\.(md|mdx)$/.test(e.name)) out.push(full)
  }
  return out
}

async function loadEntries(baseDir: string, kind: 'blog' | 'garden'): Promise<Entry[]> {
  const files = await walk(baseDir)
  const entries: Entry[] = []
  for (const file of files) {
    const raw = await readFile(file, 'utf-8')
    const { data, content } = parseFrontmatter(raw)
    if (data.draft === true || data.draft === 'true') continue
    const rel = relative(baseDir, file).replace(/\\/g, '/')
    const lang: 'en' | 'id' = rel.startsWith('id/') ? 'id' : 'en'
    const slug = rel
      .replace(/^(en|id)\//, '')
      .replace(/\/index\.(md|mdx)$/, '')
      .replace(/\.(md|mdx)$/, '')
    const title = String(data.title ?? slug)
    const description = data.description ? String(data.description) : undefined
    const date = data.publishDate ? String(data.publishDate) : undefined
    const tags = Array.isArray(data.tags) ? (data.tags as string[]) : []
    entries.push({
      slug: `${kind}/${slug}`,
      lang,
      title,
      description,
      date,
      tags,
      excerpt: excerptOf(content)
    })
  }
  entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return entries
}

async function main() {
  const bioMd = existsSync(BIO_PATH) ? await readFile(BIO_PATH, 'utf-8') : ''
  const blog = (await loadEntries(BLOG_DIR, 'blog')).slice(0, MAX_POSTS)
  const mind_garden = (await loadEntries(GARDEN_DIR, 'garden')).slice(0, MAX_GARDEN)

  const bundle: Bundle = {
    generated_at: new Date().toISOString(),
    site: { url: SITE.SITEURL, title: SITE.TITLE },
    bio_md: bioMd,
    tech_stack: TECH_STACK,
    socials: SOCIAL_LINKS.map(({ label, href }) => ({ label, href })),
    projects: PROJECTS,
    blog,
    mind_garden
  }

  await mkdir(join(ROOT, 'public/voice'), { recursive: true })
  await writeFile(OUT, JSON.stringify(bundle, null, 2), 'utf-8')
  const kb = (Buffer.byteLength(JSON.stringify(bundle)) / 1024).toFixed(1)
  console.log(
    `[aksara-context] wrote ${relative(ROOT, OUT)} — ${kb} KB, ${blog.length} blog + ${mind_garden.length} garden + ${PROJECTS.length} projects`
  )
}

main().catch((e) => {
  console.error('[aksara-context] failed:', e)
  process.exit(1)
})
