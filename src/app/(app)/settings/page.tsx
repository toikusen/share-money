import { createClient, getAuthUser } from '@/lib/supabase/server'
import { DisplayNameForm } from '@/components/settings/DisplayNameForm'
import { PaymentAccountForm } from '@/components/settings/PaymentAccountForm'
import { SignOutButton } from '@/components/settings/SignOutButton'
import { DeleteAccountButton } from '@/components/settings/DeleteAccountButton'
import { NotificationToggle } from '@/components/notifications/NotificationToggle'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function SettingsPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [{ data: profile, error }, { data: paymentAccount }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase
      .from('payment_accounts')
      .select('bank_code, account_number, account_holder')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (error) {
    console.error('Failed to load profile', error)
    throw new Error('無法載入個人設定')
  }

  const email = user.email ?? ''
  const initial = email.charAt(0).toUpperCase()

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-6">
        <Link
          href="/trips"
          aria-label="返回帳本"
          className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">設定</h1>
      </div>

      <div className="flex flex-col gap-5">
        {/* Display name */}
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">顯示名稱</p>
          <div className="bg-white rounded-2xl shadow-card p-5">
            <DisplayNameForm initialName={profile.display_name} />
          </div>
        </section>

        {/* Payment account */}
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">收款帳戶</p>
          <div className="bg-white rounded-2xl shadow-card p-5">
            <PaymentAccountForm initial={paymentAccount} />
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">通知</p>
          <div className="bg-white rounded-2xl shadow-card p-5">
            <NotificationToggle />
          </div>
        </section>

        {/* Account info */}
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">登入帳號</p>
          <div className="bg-white rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-fill flex items-center justify-center text-sm font-semibold text-ink-2 shrink-0">
                {initial}
              </div>
              <span className="text-sm text-ink truncate">{email}</span>
            </div>
            <SignOutButton />
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">危險區域</p>
          <div className="bg-white rounded-2xl shadow-card p-4">
            <DeleteAccountButton />
          </div>
        </section>

        <p className="text-center text-xs text-ink-3">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink-2">
            隱私政策
          </Link>
        </p>
      </div>
    </main>
  )
}
