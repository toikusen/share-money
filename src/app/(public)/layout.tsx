import Link from 'next/link'

const NAV = [
  ['/guide', '使用教學'],
  ['/settlement', '結算原理'],
  ['/faq', '常見問題'],
  ['/privacy', '隱私政策'],
] as const

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
          <Link href="/" className="text-base font-bold text-ink shrink-0">
            share<span className="text-ink-4 font-normal mx-0.5">·</span>money
          </Link>
          <nav className="flex items-center gap-3 text-xs text-ink-3 overflow-x-auto">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="whitespace-nowrap hover:text-ink transition-colors">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-2 text-xs text-ink-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-ink transition-colors">{label}</Link>
            ))}
            <Link href="/login" className="hover:text-ink transition-colors">登入</Link>
          </div>
          <p>ShareMoney 分帳 — 旅遊、聚餐、社團、合租都能用的共同費用記帳與結算工具。</p>
        </div>
      </footer>
    </div>
  )
}
