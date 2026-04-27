#!/usr/bin/env bun
/**
 * Walks src/content/{blog,mind-garden}/{en,id} and reports which English
 * entries are missing Indonesian translations. Run via `bun run check:i18n`.
 *
 * This is informational — it never fails the build. Use it as a TODO list
 * for content work. The site itself uses EN-fallback routing so visitors
 * never hit a 404, but search engines and bilingual readers benefit from
 * real translations being filled in over time.
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const COLLECTIONS = ['blog', 'mind-garden'] as const

type Entry = { collection: string; locale: 'en' | 'id'; slug: string }

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    const s = await stat(full)
    if (s.isDirectory()) {
      yield* walk(full)
    } else if (name.endsWith('.md') || name.endsWith('.mdx')) {
      yield full
    }
  }
}

function entryFromPath(path: string, collection: string): Entry | null {
  const rel = relative(join(ROOT, 'src/content', collection), path).replace(/\\/g, '/')
  const [locale, ...rest] = rel.split('/')
  if (locale !== 'en' && locale !== 'id') return null
  // Strip trailing /index.md(x) so foo/bar/index.md becomes "foo/bar"
  const slug = rest.join('/').replace(/\/index\.(md|mdx)$/, '').replace(/\.(md|mdx)$/, '')
  return { collection, locale, slug }
}

const PALETTE = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}
const c = (color: keyof typeof PALETTE, s: string) =>
  process.stdout.isTTY ? `${PALETTE[color]}${s}${PALETTE.reset}` : s

let totalMissing = 0
let totalEn = 0
let totalId = 0

for (const collection of COLLECTIONS) {
  const root = join(ROOT, 'src/content', collection)
  const entries: Entry[] = []
  for await (const path of walk(root)) {
    const e = entryFromPath(path, collection)
    if (e) entries.push(e)
  }

  const enSlugs = new Set(entries.filter((e) => e.locale === 'en').map((e) => e.slug))
  const idSlugs = new Set(entries.filter((e) => e.locale === 'id').map((e) => e.slug))
  const missing = [...enSlugs].filter((slug) => !idSlugs.has(slug)).sort()
  const orphans = [...idSlugs].filter((slug) => !enSlugs.has(slug)).sort()

  totalEn += enSlugs.size
  totalId += idSlugs.size
  totalMissing += missing.length

  console.log(
    c('bold', `\n📚 ${collection}`),
    c('dim', `(EN: ${enSlugs.size}, ID: ${idSlugs.size})`)
  )

  if (missing.length === 0) {
    console.log('   ', c('green', '✓ Full parity'))
  } else {
    console.log('   ', c('yellow', `⚠ ${missing.length} EN entries without ID translation:`))
    for (const slug of missing) {
      console.log('   ', c('dim', '·'), c('cyan', slug))
    }
  }

  if (orphans.length > 0) {
    console.log(
      '   ',
      c('red', `✗ ${orphans.length} ID entries with no EN counterpart (orphans):`)
    )
    for (const slug of orphans) {
      console.log('   ', c('dim', '·'), c('red', slug))
    }
  }
}

console.log()
console.log(c('bold', '──────────'))
console.log(c('bold', `Total: ${totalEn} EN, ${totalId} ID, ${totalMissing} missing translations`))
console.log()
