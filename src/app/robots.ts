import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sharemoney.cc'
  return {
    // Everything under these needs a session, so crawling them only yields redirects.
    rules: { userAgent: '*', allow: '/', disallow: ['/trips/', '/settings/', '/review/', '/auth/', '/join/'] },
    sitemap: `${base}/sitemap.xml`,
  }
}
