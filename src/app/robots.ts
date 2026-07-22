import type { MetadataRoute } from 'next'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    // Everything under these needs a session, so crawling them only yields redirects.
    rules: { userAgent: '*', allow: '/', disallow: ['/trips/', '/settings/', '/review/', '/auth/', '/join/'] },
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
  }
}
