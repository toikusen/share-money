import type { MetadataRoute } from 'next'

// Only the pages that work without a session — everything else is behind auth.
const PUBLIC_PATHS = ['/', '/guide', '/settlement', '/faq', '/privacy']

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sharemoney.cc'
  return PUBLIC_PATHS.map(path => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '/' ? 1 : 0.7,
  }))
}
