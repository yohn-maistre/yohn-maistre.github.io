/*
 * Builds public/voice/search-index.json — a BM25-only content index for
 * Aksara's `search_content` tool. v1 ships without precomputed
 * embeddings (the runtime is keyword-strong); embeddings can be folded
 * in via a follow-up that adds a build-time `text-embedding-005` pass
 * once a Gemini API key is available at build time.
 *
 * Runs before `astro build` (see package.json#scripts.build).
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'public/voice/search-index.json')
const BLOG_DIR = join(ROOT, 'src/content/blog')
const GARDEN_DIR = join(ROOT, 'src/content/mind-garden')

const SUMMARY_CHARS = 240
const MAX_BODY_CHARS = 4000

interface Doc {
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

async function loadEntries(baseDir: string, kind: 'blog' | 'garden'): Promise<Doc[]> {
  const files = await walk(baseDir)
  const docs: Doc[] = []
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
    const plain = stripMarkdown(content)
    const body = plain.slice(0, MAX_BODY_CHARS)
    const summary = plain.slice(0, SUMMARY_CHARS) + (plain.length > SUMMARY_CHARS ? '…' : '')
    const langPrefix = lang === 'id' ? '/id' : ''
    const folder = kind === 'blog' ? 'blog' : 'mind-garden'
    const url = `${langPrefix}/${folder}/${slug}`
    docs.push({
      id: `${kind}:${lang}:${slug}`,
      kind,
      lang,
      slug,
      title,
      description,
      date,
      tags,
      url,
      summary,
      body
    })
  }
  return docs
}

// Curated project list — these aren't files on disk so we hand-author them.
// Same data as scripts/build-aksara-context.ts (kept in sync by humans for now).
const PROJECT_DOCS: Doc[] = [
  {
    id: 'project:en:aksara',
    kind: 'project',
    lang: 'en',
    slug: 'aksara',
    title: 'Aksara — autonomous AI agent platform',
    description:
      'Autonomous AI agent platform providing on-demand digital experts for complex cognitive tasks.',
    tags: ['voice', 'ai', 'agents'],
    url: 'https://github.com/yohn-maistre/aksara',
    summary:
      'Autonomous AI agent platform providing on-demand digital experts for complex cognitive tasks. The voice agent on this site is itself a slice of this larger project.',
    body:
      'Aksara is Yose\'s autonomous AI agent platform providing on-demand digital experts to handle complex cognitive tasks. AI agents, orchestration, voice, Abstraksi, Papua.'
  },
  {
    id: 'project:en:philo-fight-club-ai',
    kind: 'project',
    lang: 'en',
    slug: 'philo-fight-club-ai',
    title: 'Philo-Fight-Club-AI — voice debate with philosophers',
    description:
      'Voice-interactive debate platform where you challenge history\'s greatest philosophers through real-time AI conversations.',
    tags: ['voice', 'ai', 'philosophy'],
    url: 'https://github.com/yohn-maistre/philo-fight-club-ai',
    summary:
      'Voice-interactive debate platform where you challenge history\'s greatest philosophers through real-time AI conversations.',
    body:
      'A voice-interactive debate platform where you challenge history\'s greatest philosophical minds through real-time AI conversations.'
  },
  {
    id: 'project:en:respiratory-diseases-classifier',
    kind: 'project',
    lang: 'en',
    slug: 'respiratory-diseases-classifier',
    title: 'Respiratory Diseases Classifier — Streamlit app',
    description:
      'Streamlit web app that classifies pulmonary diseases from respiratory sound recordings (.wav).',
    tags: ['ml', 'audio', 'health'],
    url: 'https://github.com/yohn-maistre/respiratory-diseases-classifier',
    summary:
      'Streamlit web app that classifies pulmonary diseases from respiratory sound recordings (.wav).',
    body:
      'Streamlit ML web app classifying pulmonary diseases from respiratory sound wav recordings. Audio ML, Python.'
  },
  {
    id: 'project:en:hn-webhook',
    kind: 'project',
    lang: 'en',
    slug: 'hn-webhook',
    title: 'HN-Webhook',
    description: 'Discord webhook for the top + best 10 Hacker News stories.',
    tags: ['web', 'automation', 'discord'],
    url: 'https://github.com/yohn-maistre/hn-webhook',
    summary: 'Discord webhook fetching 10 top and 10 best Hacker News stories.',
    body: 'Simple Discord webhook for fetching 10 top and 10 best stories from Hacker News.'
  },
  {
    id: 'project:en:portfolio',
    kind: 'project',
    lang: 'en',
    slug: 'portfolio',
    title: 'yohn-maistre.github.io',
    description: 'This portfolio. Astro 5, bilingual, with a voice agent (hi).',
    tags: ['astro', 'personal'],
    url: 'https://github.com/yohn-maistre/yohn-maistre.github.io',
    summary: 'This portfolio site, built with Astro 5, bilingual, with a voice agent (hi from Aksara).',
    body: 'Personal portfolio website. Astro 5, React 19, UnoCSS, bilingual EN+ID, voice agent powered by Gemini Live.'
  }
]

async function main() {
  const blog = await loadEntries(BLOG_DIR, 'blog')
  const garden = await loadEntries(GARDEN_DIR, 'garden')
  const docs: Doc[] = [...blog, ...garden, ...PROJECT_DOCS]

  const index = {
    version: 1,
    generated_at: new Date().toISOString(),
    docs
  }
  await mkdir(join(ROOT, 'public/voice'), { recursive: true })
  await writeFile(OUT, JSON.stringify(index), 'utf-8')
  const kb = (Buffer.byteLength(JSON.stringify(index)) / 1024).toFixed(1)
  console.log(
    `[search-index] wrote ${relative(ROOT, OUT)} — ${kb} KB, ${blog.length} blog + ${garden.length} garden + ${PROJECT_DOCS.length} projects`
  )
}

main().catch((e) => {
  console.error('[search-index] failed:', e)
  process.exit(1)
})
