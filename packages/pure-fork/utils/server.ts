import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content'

type Collections = CollectionEntry<CollectionKey>[]

export const prod = import.meta.env.PROD

export type Locale = 'en' | 'id'

/**
 * Fetch a content collection filtered to a specific locale.
 *
 * IMPORTANT: `locale` is required. Calling without an explicit locale used to
 * silently return *all* locales — that's how the same post (e.g. solarpunk)
 * leaked into RSS feeds twice. We now throw early so the bug surfaces at build
 * time instead of in production.
 *
 * Drafts are filtered out in production builds.
 *
 * Entry IDs are normalised to forward-slashes first so this works on Windows
 * dev machines (the glob loader sometimes hands us back back-slashes).
 */
export async function getBlogCollection(
  locale: Locale,
  contentType: CollectionKey = 'blog'
) {
  if (!locale) {
    throw new Error(
      `getBlogCollection() requires an explicit locale ('en' | 'id'). ` +
      `Calling without one used to silently aggregate all locales and caused duplicate posts in RSS / homepage. ` +
      `Update the call site to pass a locale explicitly.`
    )
  }

  return await getCollection(contentType, (entry) => {
    const isProd = prod
    const isDraft = entry.data.draft
    const [entryLocale] = entry.id.replace(/\\/g, '/').split('/')

    return (isProd ? !isDraft : true) && entryLocale === locale
  })
}

/**
 * Fetch every entry in a collection regardless of locale. Use this for
 * cross-locale operations like building a parity matrix or generating
 * fallback paths. Production-mode draft filtering still applies.
 */
export async function getAllLocalesCollection(contentType: CollectionKey = 'blog') {
  return await getCollection(contentType, (entry) => {
    const isProd = prod
    return isProd ? !entry.data.draft : true
  })
}

/**
 * Strip the locale prefix from an entry id.
 * "en/solarpunk" -> "solarpunk", "id/foo/bar" -> "foo/bar"
 */
export function stripLocaleFromId(id: string): string {
  return id.replace(/\\/g, '/').replace(/^(en|id)\//, '')
}

/**
 * Read the locale prefix from an entry id, defaulting to 'en'.
 */
export function getLocaleFromId(id: string): Locale {
  const [prefix] = id.replace(/\\/g, '/').split('/')
  return prefix === 'id' ? 'id' : 'en'
}

/**
 * Get the locale-preferred view of a collection: every EN entry, replaced by
 * its ID translation when one exists. Use this on ID listing pages so that
 * untranslated posts still appear (and link to the EN-fallback route).
 */
export async function getLocalePreferredCollection(
  locale: Locale,
  contentType: CollectionKey = 'blog'
) {
  const enEntries = await getBlogCollection('en', contentType)
  if (locale === 'en') return enEntries

  const idEntries = await getBlogCollection('id', contentType)
  const bySlug = new Map(idEntries.map((e) => [stripLocaleFromId(e.id), e]))
  return enEntries.map((e) => bySlug.get(stripLocaleFromId(e.id)) ?? e)
}

function getYearFromCollection<T extends CollectionKey>(
  collection: CollectionEntry<T>
): number | undefined {
  const dateStr = collection.data.updatedDate ?? collection.data.publishDate
  return dateStr ? new Date(dateStr).getFullYear() : undefined
}
export function groupCollectionsByYear<T extends CollectionKey>(
  collections: Collections
): [number, CollectionEntry<T>[]][] {
  const collectionsByYear = collections.reduce((acc, collection) => {
    const year = getYearFromCollection(collection)
    if (year !== undefined) {
      if (!acc.has(year)) {
        acc.set(year, [])
      }
      acc.get(year)!.push(collection)
    }
    return acc
  }, new Map<number, Collections>())

  return Array.from(
    collectionsByYear.entries() as IterableIterator<[number, CollectionEntry<T>[]]>
  ).sort((a, b) => b[0] - a[0])
}

export function sortMDByDate(collections: Collections): Collections {
  return collections.sort((a, b) => {
    const aDate = new Date(a.data.updatedDate ?? a.data.publishDate ?? 0).valueOf()
    const bDate = new Date(b.data.updatedDate ?? b.data.publishDate ?? 0).valueOf()
    return bDate - aDate
  })
}

/** Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so. */
export function getAllTags(collections: Collections) {
  return collections.flatMap((collection) => [...collection.data.tags])
}

/** Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so. */
export function getUniqueTags(collections: Collections) {
  return [...new Set(getAllTags(collections))]
}

/** Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so. */
export function getUniqueTagsWithCount(collections: Collections): [string, number][] {
  return [
    ...getAllTags(collections).reduce(
      (acc, t) => acc.set(t, (acc.get(t) || 0) + 1),
      new Map<string, number>()
    )
  ].sort((a, b) => b[1] - a[1])
}
