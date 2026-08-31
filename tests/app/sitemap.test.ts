import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import { ARTICLES } from '@/content/articles'
import { findArticleEvidence } from '@/content/articles/evidence'

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

  it('dates articles by their substantive review date', () => {
    const entry = sitemap().find(e => e.url.endsWith(`/articles/${ARTICLES[0].slug}`))!
    expect(entry.lastModified).toEqual(new Date(findArticleEvidence(ARTICLES[0].slug)!.reviewedAt))
  })

  it('does not pretend evergreen pages changed on every request', () => {
    const first = sitemap().find(e => e.url === 'https://sharemoney.cc')!
    const second = sitemap().find(e => e.url === 'https://sharemoney.cc')!

    expect(first.lastModified).toBeUndefined()
    expect(second.lastModified).toBeUndefined()
  })
})
