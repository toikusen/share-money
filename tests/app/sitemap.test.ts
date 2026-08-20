import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import { ARTICLES } from '@/content/articles'

const urls = sitemap().map(entry => entry.url)

describe('sitemap', () => {
  it('lists every article', () => {
    for (const a of ARTICLES) {
      expect(urls).toContain(`https://sharemoney.cc/articles/${a.slug}`)
    }
  })

  it('lists the public content pages', () => {
    for (const path of ['', '/articles', '/calculator', '/demo', '/guide', '/settlement', '/faq']) {
      expect(urls).toContain(`https://sharemoney.cc${path}`)
    }
  })

  it('has no duplicates and no trailing slash on the homepage', () => {
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).not.toContain('https://sharemoney.cc/')
  })

  it('dates articles by their own published date', () => {
    const entry = sitemap().find(e => e.url.endsWith(`/articles/${ARTICLES[0].slug}`))!
    expect(entry.lastModified).toEqual(new Date(ARTICLES[0].published))
  })
})
