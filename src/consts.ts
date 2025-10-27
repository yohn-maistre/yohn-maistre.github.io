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
