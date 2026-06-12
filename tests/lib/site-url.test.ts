import { describe, expect, it } from 'vitest'
import { getSiteUrlFromHeaders, normalizeSiteUrl, safeRedirectPath } from '@/lib/site-url'

describe('normalizeSiteUrl', () => {
  it('returns the URL origin without path or trailing slash', () => {
    expect(normalizeSiteUrl('https://example.com/foo?bar=baz')).toBe('https://example.com')
  })

  it('returns null for invalid values', () => {
    expect(normalizeSiteUrl('not a url')).toBeNull()
  })
})

describe('getSiteUrlFromHeaders', () => {
  it('uses forwarded host and proto when present', () => {
    const headers = new Headers({
      'x-forwarded-host': 'share-money.tuyucheng0407.workers.dev',
      'x-forwarded-proto': 'https',
      host: 'localhost:3000',
    })

    expect(getSiteUrlFromHeaders(headers)).toBe('https://share-money.tuyucheng0407.workers.dev')
  })

  it('defaults localhost hosts to http', () => {
    const headers = new Headers({ host: 'localhost:3000' })

    expect(getSiteUrlFromHeaders(headers)).toBe('http://localhost:3000')
  })
})

describe('safeRedirectPath', () => {
  it('allows relative app paths', () => {
    expect(safeRedirectPath('/trips')).toBe('/trips')
  })

  it('rejects external-like paths', () => {
    expect(safeRedirectPath('//evil.example')).toBe('/trips')
    expect(safeRedirectPath('https://evil.example')).toBe('/trips')
  })
})
