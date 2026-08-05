import { describe, expect, it } from 'vitest'
import { isNavActive } from '@/components/public/PublicNav'

describe('isNavActive', () => {
  it('matches the exact path', () => {
    expect(isNavActive('/faq', '/faq')).toBe(true)
  })

  it('matches sub-paths', () => {
    expect(isNavActive('/guide/split', '/guide')).toBe(true)
  })

  it('does not match a longer sibling segment', () => {
    expect(isNavActive('/faqs', '/faq')).toBe(false)
  })

  it('does not match the homepage', () => {
    expect(isNavActive('/', '/calculator')).toBe(false)
  })

  it('tolerates a null pathname', () => {
    expect(isNavActive(null, '/faq')).toBe(false)
  })
})
