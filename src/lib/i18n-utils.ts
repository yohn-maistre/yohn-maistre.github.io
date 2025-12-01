/**
 * i18n utility functions for locale-aware navigation and URL building
 */

/**
 * Remove trailing slash from path (respects site config trailingSlash: never)
 * @param path - Path to normalize
 * @returns Path without trailing slash
 */
export function normalizeTrailingSlash(path: string): string {
    if (path === '/') return path;
    return path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Build a locale-aware URL path
 * @param path - The base path (e.g., '/about', '/blog')
 * @param locale - The target locale (e.g., 'en', 'id')
 * @param defaultLocale - The default locale (defaults to 'en')
 * @returns Properly formatted path with locale prefix if needed
 */
export function getLocalizedPath(
    path: string,
    locale: string,
    defaultLocale: string = 'en'
): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    // Build the result
    const result = locale === defaultLocale
        ? normalizedPath
        : `/${locale}${normalizedPath}`;

    // Remove trailing slash to respect site config
    return normalizeTrailingSlash(result);
}

/**
 * Extract locale-agnostic slug from a content entry ID
 * Handles IDs like 'en/my-post' or 'id/my-post'
 * @param entryId - The content entry ID
 * @returns The slug without locale prefix
 */
export function getSlugFromEntryId(entryId: string): string {
    const parts = entryId.split('/');
    // If the first part looks like a locale (2-letter code), remove it
    if (parts.length > 1 && parts[0].length === 2) {
        return parts.slice(1).join('/');
    }
    return entryId;
}

/**
 * Build URL for content in a different locale
 * @param collection - Content collection name ('blog', 'mind-garden')
 * @param slug - Content slug (without locale prefix)
 * @param locale - Target locale
 * @param defaultLocale - The default locale (defaults to 'en')
 * @returns Full content path
 */
export function getContentPath(
    collection: string,
    slug: string,
    locale: string,
    defaultLocale: string = 'en'
): string {
    // Ensure slug is clean (no locale prefix)
    // This assumes the slug passed in might be clean or might have prefix if coming from raw ID
    // But getSlugFromEntryId should be used before calling this if needed.
    // However, let's be safe and strip known prefixes if they exist in the slug string itself
    // (though usually slug here is just the title slug)

    // Build the path
    // Default locale: /collection/slug
    // Other locale: /locale/collection/slug

    if (locale === defaultLocale) {
        return normalizeTrailingSlash(`/${collection}/${slug}`);
    }
    return normalizeTrailingSlash(`/${locale}/${collection}/${slug}`);
}

/**
 * Parse a content URL to extract collection, locale, and slug
 * @param pathname - The URL pathname (e.g., '/blog/my-post' or '/id/blog/my-post')
 * @returns Object with collection, locale, and slug, or null if not a content URL
 */
export function parseContentUrl(pathname: string): {
    collection: string;
    locale: string;
    slug: string;
} | null {
    // Remove trailing slash
    const normalizedPath = pathname.endsWith('/') && pathname !== '/'
        ? pathname.slice(0, -1)
        : pathname;

    const parts = normalizedPath.split('/').filter(Boolean);

    // Pattern 1: /collection/slug (default locale 'en')
    if (parts.length >= 2 && (parts[0] === 'blog' || parts[0] === 'mind-garden')) {
        return {
            collection: parts[0],
            locale: 'en', // Default locale
            slug: parts.slice(1).join('/'),
        };
    }

    // Pattern 2: /locale/collection/slug (e.g. /id/blog/slug)
    if (parts.length >= 3 && parts[0].length === 2 && (parts[1] === 'blog' || parts[1] === 'mind-garden')) {
        return {
            collection: parts[1],
            locale: parts[0],
            slug: parts.slice(2).join('/'),
        };
    }

    return null;
}
