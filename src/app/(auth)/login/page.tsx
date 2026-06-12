// src/app/(auth)/login/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getRequestSiteUrl, safeRedirectPath } from '@/lib/site-url'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(safeRedirectPath(next))

  async function signIn() {
    'use server'
    const supabase = await createClient()
    const { next: nextParam } = await searchParams
    const callbackUrl = new URL('/auth/callback', await getRequestSiteUrl())
    callbackUrl.searchParams.set('next', safeRedirectPath(nextParam))

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
    if (data.url) redirect(data.url)
    if (error) throw new Error(error.message)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6">
      {/* Hero brand block */}
      <div className="flex flex-col items-center mb-10">
        <div className="h-16 w-16 rounded-2xl bg-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50">
          <svg width="44" height="32" viewBox="0 0 22 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="8" r="6" fill="white" fillOpacity="0.3"/>
            <circle cx="15" cy="8" r="6" fill="white"/>
            <line x1="15" y1="3.5" x2="15" y2="12.5" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M17.5 5.5C17.5 4.5 16.5 4 15 4C13.5 4 12.5 4.7 12.5 6C12.5 7 13.5 7.5 15 8C16.5 8.5 17.5 9 17.5 10C17.5 11.3 16.5 12 15 12C13.5 12 12.5 11.5 12.5 10.5" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-1 select-none text-indigo-600 dark:text-indigo-400">
          share<span className="text-gray-300 dark:text-gray-600 font-normal mx-1">·</span>money
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500">旅遊分帳，輕鬆不傷感情</p>
      </div>

      {/* Login card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8 w-full max-w-sm">
        <form action={signIn}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 shrink-0" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            使用 Google 帳號登入
          </button>
        </form>
      </div>
    </main>
  )
}
