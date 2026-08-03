import Link from 'next/link'

const NAV = [
  ['/calculator', '分帳計算機'],
  ['/guide', '使用教學'],
  ['/settlement', '結算原理'],
  ['/faq', '常見問題'],
] as const

const FOOTER = [
  ['/about', '關於我們'],
  ['/contact', '聯絡我們'],
  ['/terms', '服務條款'],
  ['/privacy', '隱私政策'],
] as const

/**
 * ca-pub-… — unset in dev/preview, so no AdSense script is loaded there.
 * Scoped to this layout on purpose: ads belong on the public content pages,
 * not on the login screen or inside a member's ledger.
 */
const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
          <Link href="/" className="text-base font-bold text-ink shrink-0">
            share<span className="text-ink-4 font-normal mx-0.5">·</span>money
          </Link>
          <nav aria-label="主要導覽" className="flex items-center gap-3 text-xs text-ink-3 overflow-x-auto">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="whitespace-nowrap hover:text-ink transition-colors">
                {label}
              </Link>
            ))}
            <Link href="/login" className="whitespace-nowrap font-semibold text-accent hover:text-accent-deep transition-colors">
              登入
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-8 flex flex-col gap-3 text-xs text-ink-3">
          <nav aria-label="頁尾導覽" className="flex flex-wrap gap-x-4 gap-y-2">
            {[...NAV, ...FOOTER].map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-ink transition-colors">{label}</Link>
            ))}
          </nav>
          <p className="leading-relaxed">
            ShareMoney 分帳 — 旅遊、聚餐、社團、合租都能用的共同費用記帳與結算工具。
          </p>
          <p>© {new Date().getFullYear()} ShareMoney · sharemoney.cc</p>
        </div>
      </footer>

      {adsenseClient && (
        // Plain <script>, not next/script: every next/script strategy emits a preload +
        // a client-side bootstrap instead of a literal tag, and the AdSense verification
        // crawler looks for the tag itself. React hoists this into <head>.
        <script
          async
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
        />
      )}
    </div>
  )
}
