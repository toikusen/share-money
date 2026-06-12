import { createClient } from '@/lib/supabase/server'
import { DisplayNameForm } from '@/components/settings/DisplayNameForm'
import { SignOutButton } from '@/components/settings/SignOutButton'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Failed to load profile', error)
    throw new Error('無法載入個人設定')
  }

  const email = user.email ?? ''
  const initial = email.charAt(0).toUpperCase()

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">←</Link>
        <h1 className="text-xl font-bold">設定</h1>
      </div>

      <div className="flex flex-col gap-4">
        {/* Account info */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 dark:bg-gray-900 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-3">登入帳號</p>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
              {initial}
            </div>
            <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{email}</span>
          </div>
          <SignOutButton />
        </section>

        {/* Display name */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
          <DisplayNameForm initialName={profile.display_name} />
        </section>
      </div>
    </main>
  )
}
