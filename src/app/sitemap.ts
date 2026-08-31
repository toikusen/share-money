import type { MetadataRoute } from 'next'
import { ARTICLES } from '@/content/articles'
import { findArticleEvidence } from '@/content/articles/evidence'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

// Only the pages that work without a session — everything else is behind auth.
const PUBLIC_PATHS = [
  ['/', 1.0],
  ['/calculator', 0.9],
  ['/articles', 0.9],
  ['/guide', 0.8],
  ['/settlement', 0.8],
  ['/faq', 0.7],
  ['/demo', 0.6],
  ['/about', 0.5],
  ['/contact', 0.4],
  ['/terms', 0.3],
  ['/privacy', 0.3],
] as const

const absolute = (path: string) => `${CANONICAL_SITE_URL}${path === '/' ? '' : path}`

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PUBLIC_PATHS.map(([path, priority]) => ({
      url: absolute(path),
      changeFrequency: 'monthly' as const,
      priority,
    })),
    // Articles carry their own dates, so crawlers can tell which ones actually changed.
    ...ARTICLES.map(a => ({
      url: absolute(`/articles/${a.slug}`),
      lastModified: new Date(findArticleEvidence(a.slug)?.reviewedAt ?? a.updated ?? a.published),
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
  ]
}
