export type Site = {
  TITLE: string
  DESCRIPTION: string
  EMAIL: string
  NUM_POSTS_ON_HOMEPAGE: number
  POSTS_PER_PAGE: number
  SITEURL: string
}

export type Link = {
  href: string
  label: string
}

export const SITE: Site = {
  TITLE: 'yose.is-a.dev',
  DESCRIPTION:
    'Freelance frontend web development and AI shenanigans.',
  EMAIL: 'giyaibo@pm.me',
  NUM_POSTS_ON_HOMEPAGE: 2,
  POSTS_PER_PAGE: 4,
  SITEURL: 'https://yose.is-a.dev',
}

export const NAV_LINKS: Link[] = [
  { href: '/', label: 'home' },
  { href: '/blog', label: 'blog' },
  // { href: '/authors', label: 'authors' },
  // { href: '/about', label: 'about' },
  // { href: '/tags', label: 'tags' },
]

export const SOCIAL_LINKS: Link[] = [
  { href: 'https://github.com/yohn-maistre', label: 'GitHub' },
  { href: 'https://x.com/jind0sh', label: 'Twitter' },
  { href: 'giyaibo@pm.me', label: 'Email' },
  { href: '/rss.xml', label: 'RSS' },
]

/**
 * External-service identifiers used by the bento widgets. Keep them here so
 * one obvious place tells the next person where to fork their own copy.
 *
 * NOTE on Wakatime: the URL must come from your own account at
 * https://wakatime.com/share/embed — the bundled value below is a placeholder
 * pointing at the upstream template author's stats. Replace with yours.
 */
export const BENTO = {
  DISCORD_USER_ID: '255315077501157376',
  DISCORD_USERNAME: 'jind0sh',
  DISCORD_DISPLAY_NAME: 'jind0sh',
  LASTFM_USERNAME: 'giyaibo',
  WAKATIME_SHARE_URL:
    'https://wakatime.com/share/@jktrn/ef6e633b-589d-44f2-9ae6-0eb93445cf2a.json',
} as const
