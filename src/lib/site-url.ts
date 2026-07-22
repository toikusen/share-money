import { headers } from 'next/headers'

const LOCAL_SITE_URL = 'http://localhost:3000'

/**
 * Canonical public origin for sitemap/robots. Deliberately not read from
 * NEXT_PUBLIC_SITE_URL: the Cloudflare build environment still exports the old
 * workers.dev value, which would publish the wrong URLs to search engines.
 */
export const CANONICAL_SITE_URL = 'https://sharemoney.cc'

type HeaderReader = Pick<Headers, 'get'>

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null
}

export function normalizeSiteUrl(value: string | null | undefined) {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function getSiteUrlFromHeaders(headersList: HeaderReader) {
  const host = firstHeaderValue(headersList.get('x-forwarded-host')) ?? firstHeaderValue(headersList.get('host'))
  if (!host) return null

  const forwardedProto = firstHeaderValue(headersList.get('x-forwarded-proto'))
  const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')

  return normalizeSiteUrl(`${proto}://${host}`)
}

export async function getRequestSiteUrl() {
  const headersList = await headers()

  return (
    getSiteUrlFromHeaders(headersList) ??
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    LOCAL_SITE_URL
  )
}

export function safeRedirectPath(path: string | null | undefined, fallback = '/trips') {
  if (!path?.startsWith('/') || path.startsWith('//')) return fallback

  return path
}
