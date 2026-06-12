import { createClient } from '@/lib/supabase/server'
import { DisplayNameForm } from '@/components/settings/DisplayNameForm'
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

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold">設定</h1>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
        <DisplayNameForm initialName={profile.display_name} />
      </section>
    </main>
  )
}
