import Link from 'next/link'
import { AdsenseScript } from '@/components/AdsenseScript'
import { PublicNav } from '@/components/public/PublicNav'

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

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <PublicNav />

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

      <AdsenseScript />
    </div>
  )
}
