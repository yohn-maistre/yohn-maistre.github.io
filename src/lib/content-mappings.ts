/**
 * Mapping of content slugs between locales
 * Used when content has different slugs in different languages
 */

export interface ContentMapping {
    en: string;
    id: string;
}

/**
 * Blog post slug mappings
 * Add entries here when a blog post has different slugs in different locales
 */
export const blogSlugMappings: ContentMapping[] = [
    {
        en: 'solarpunk',
        id: 'solarpunk-id'
    }
    // Add more mappings as needed
];

/**
 * Mind Garden slug mappings
 * Add entries here when mind-garden content has different slugs
 */
export const mindGardenSlugMappings: ContentMapping[] = [
    // Add mappings as needed
];

/**
 * Get the corresponding slug in the target locale
 * @param collection - Content collection ('blog' or 'mind-garden')
 * @param slug - Current slug
 * @param currentLocale - Current locale
 * @param targetLocale - Target locale
 * @returns Mapped slug or original if no mapping exists
 */
export function getMappedSlug(
    collection: string,
    slug: string,
    currentLocale: string,
    targetLocale: string
): string {
    const mappings = collection === 'blog' ? blogSlugMappings : mindGardenSlugMappings;

    // Find mapping where current locale matches the slug
    const mapping = mappings.find(m => m[currentLocale as keyof ContentMapping] === slug);

    if (mapping) {
        return mapping[targetLocale as keyof ContentMapping];
    }

    // No mapping found, return original slug
    return slug;
}
