import type { MetadataRoute } from 'next'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    // Everything under these needs a session, so crawling them only yields redirects.
    // /login is reachable but thin — keeping it out of the index avoids diluting the
    // public content pages.
    rules: { userAgent: '*', allow: '/', disallow: ['/trips/', '/settings/', '/review/', '/auth/', '/join/', '/login'] },
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
  }
}
