'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  ['/calculator', '分帳計算機'],
  ['/guide', '使用教學'],
  ['/settlement', '結算原理'],
  ['/faq', '常見問題'],
] as const

/** 當前路徑是否落在該導覽項目(含子路徑)之下。 */
export const isNavActive = (pathname: string | null, href: string) =>
  pathname === href || !!pathname?.startsWith(href + '/')

export function PublicNav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-2xl mx-auto px-5 sm:px-6 py-[13px] sm:py-3.5 flex items-center gap-2">
        <Link href="/" className="text-base sm:text-[17px] font-bold text-ink shrink-0">
          share<span className="text-ink-4 font-normal mx-0.5">·</span>money
        </Link>

        {/* 桌機:單行右對齊 */}
        <nav aria-label="主要導覽" className="hidden sm:flex items-center gap-1 ml-auto">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isNavActive(pathname, href) ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-[13px] whitespace-nowrap transition-colors ${
                isNavActive(pathname, href)
                  ? 'bg-fill font-semibold text-ink'
                  : 'font-normal text-ink-3 hover:text-ink'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <Link
          href="/login"
          className="ml-auto sm:ml-0 shrink-0 rounded-[9px] bg-accent px-[18px] sm:px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          登入
        </Link>
      </div>

      {/* 手機:四等分不捲動,每格 46px 觸控高度 */}
      <nav aria-label="主要導覽" className="sm:hidden grid grid-cols-4 border-t border-line">
        {NAV.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={isNavActive(pathname, href) ? 'page' : undefined}
            className={`h-[46px] flex items-center justify-center text-[13px] transition-colors ${
              isNavActive(pathname, href)
                ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-accent)]'
                : 'font-normal text-ink-3'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
