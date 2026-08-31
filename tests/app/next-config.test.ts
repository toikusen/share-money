import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

describe('Next.js redirects', () => {
  it('leaves protocol redirects to the Cloudflare edge', async () => {
    expect(await nextConfig.redirects?.() ?? []).toEqual([])
  })
})
