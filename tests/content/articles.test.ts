import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARTICLES, findArticle, relatedArticles } from '@/content/articles'

const SRC_DIR = join(import.meta.dirname, '../../src')

const CATEGORIES = ['旅遊', '合租', '聚餐', '觀念', '工具']

describe('ARTICLES', () => {
  it('has articles to publish', () => {
    expect(ARTICLES.length).toBeGreaterThan(0)
  })

  it('has unique slugs', () => {
    const slugs = ARTICLES.map(a => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it.each(ARTICLES.map(a => [a.slug, a] as const))('%s is publishable', (_slug, a) => {
    expect(a.slug).toMatch(/^[a-z0-9-]+$/)
    expect(a.title.length).toBeGreaterThan(8)
    // meta description 過長會被搜尋結果截斷
    expect(a.description.length).toBeGreaterThan(40)
    expect(a.description.length).toBeLessThanOrEqual(200)
    expect(a.published).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(a.published))).toBe(false)
    expect(CATEGORIES).toContain(a.category)
    expect(a.body).toBeTruthy()
  })
})

describe('findArticle', () => {
  it('finds by slug', () => {
    expect(findArticle(ARTICLES[0].slug)?.title).toBe(ARTICLES[0].title)
  })

  it('returns undefined for an unknown slug', () => {
    expect(findArticle('no-such-article')).toBeUndefined()
  })
})

describe('relatedArticles', () => {
  it('never includes the article itself', () => {
    for (const a of ARTICLES) {
      expect(relatedArticles(a.slug).map(r => r.slug)).not.toContain(a.slug)
    }
  })

  it('respects the limit', () => {
    expect(relatedArticles(ARTICLES[0].slug, 2)).toHaveLength(2)
  })

  it('puts same-category articles first', () => {
    const target = ARTICLES.find(a => ARTICLES.filter(b => b.category === a.category).length > 1)!
    expect(relatedArticles(target.slug)[0].category).toBe(target.category)
  })

  it('still fills up when the category has no siblings', () => {
    const lonely = ARTICLES.find(a => ARTICLES.filter(b => b.category === a.category).length === 1)
    if (!lonely) return
    expect(relatedArticles(lonely.slug)).toHaveLength(3)
  })
})

describe('文章內部連結', () => {
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => join(SRC_DIR, f))

  const links = files.flatMap(f =>
    [...readFileSync(f, 'utf8').matchAll(/href="\/articles\/([a-z0-9-]+)"/g)].map(m => [f, m[1]] as const),
  )

  it('finds article links to check', () => {
    expect(links.length).toBeGreaterThan(0)
  })

  it.each(links)('%s links to a real article: %s', (_file, slug) => {
    expect(findArticle(slug)).toBeDefined()
  })

  it('links to every article at least once, so none is orphaned', () => {
    const linked = new Set(links.map(([, slug]) => slug))
    expect(ARTICLES.filter(a => !linked.has(a.slug)).map(a => a.slug)).toEqual([])
  })

  // Tailwind v4 的 important 修飾詞是後綴(`text-left!`);寫成前綴 `!text-left` 不會產生任何規則。
  it('has no legacy prefix-bang utility classes', () => {
    const offenders = files.filter(f => /className="(?:[^"]*\s)?![a-z-]/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
