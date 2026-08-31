import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

describe('Next.js redirects', () => {
  it('permanently redirects proxied HTTP requests to the canonical HTTPS host', async () => {
    const redirects = await nextConfig.redirects?.()

    expect(redirects).toContainEqual({
      source: '/:path*',
      has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      destination: 'https://sharemoney.cc/:path*',
      permanent: true,
    })
  })
})
