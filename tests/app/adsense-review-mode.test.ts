import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = join(import.meta.dirname, '../../src')
const ROOT_LAYOUT = join(SRC_DIR, 'app/layout.tsx')
const sourceFiles = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
  .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map(file => join(SRC_DIR, file))

describe('AdSense review mode', () => {
  it('keeps account verification metadata', () => {
    expect(readFileSync(ROOT_LAYOUT, 'utf8')).toContain("'google-adsense-account'")
  })

  it('does not serve ad scripts or units anywhere', () => {
    const offenders = sourceFiles.filter(file =>
      /adsbygoogle\.js|<AdUnit|<AdsenseScript|data-ad-slot/.test(readFileSync(file, 'utf8')),
    )

    expect(offenders).toEqual([])
  })
})
