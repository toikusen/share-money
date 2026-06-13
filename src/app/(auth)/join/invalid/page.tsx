import Link from 'next/link'

export default function InvalidTokenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-5">
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm text-center flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-fill flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-ink-4" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink mb-1">連結無效</h1>
          <p className="text-sm text-ink-3">此邀請連結不存在，請向行程建立者重新索取。</p>
        </div>
        <Link href="/trips" className="text-accent text-sm font-semibold hover:text-accent-deep transition-colors">
          返回我的行程
        </Link>
      </div>
    </main>
  )
}
