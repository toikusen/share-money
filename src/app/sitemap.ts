import type { MetadataRoute } from 'next'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

// Only the pages that work without a session — everything else is behind auth.
const PUBLIC_PATHS = [
  ['/', 1.0],
  ['/calculator', 0.9],
  ['/guide', 0.8],
  ['/settlement', 0.8],
  ['/faq', 0.7],
  ['/about', 0.5],
  ['/contact', 0.4],
  ['/terms', 0.3],
  ['/privacy', 0.3],
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map(([path, priority]) => ({
    url: `${CANONICAL_SITE_URL}${path === '/' ? '' : path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority,
  }))
}
