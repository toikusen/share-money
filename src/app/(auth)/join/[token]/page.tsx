import { joinTripAction } from '@/lib/actions/members'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
  }

  async function join() {
    'use server'
    await joinTripAction(token)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-5">
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm text-center flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center">
          <svg width="32" height="24" viewBox="0 0 22 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="8" r="6" fill="white" fillOpacity="0.3"/>
            <circle cx="15" cy="8" r="6" fill="white"/>
            <line x1="15" y1="3.5" x2="15" y2="12.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M17.5 5.5C17.5 4.5 16.5 4 15 4C13.5 4 12.5 4.7 12.5 6C12.5 7 13.5 7.5 15 8C16.5 8.5 17.5 9 17.5 10C17.5 11.3 16.5 12 15 12C13.5 12 12.5 11.5 12.5 10.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink mb-1">加入帳本</h1>
          <p className="text-sm text-ink-3">點下方按鈕加入此帳本</p>
        </div>
        <form action={join} className="w-full">
          <button
            type="submit"
            className="w-full bg-accent text-white py-3 rounded-xl text-sm font-semibold hover:bg-accent-deep transition-colors"
          >
            確認加入
          </button>
        </form>
      </div>
    </main>
  )
}
