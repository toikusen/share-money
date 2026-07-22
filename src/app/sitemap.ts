import type { MetadataRoute } from 'next'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

// Only the pages that work without a session — everything else is behind auth.
const PUBLIC_PATHS = ['/', '/guide', '/settlement', '/faq', '/privacy']

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map(path => ({
    url: `${CANONICAL_SITE_URL}${path === '/' ? '' : path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '/' ? 1 : 0.7,
  }))
}
