import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RefreshOnFocus } from '@/components/realtime/RefreshOnFocus'
import { RealtimeRefresher } from '@/components/realtime/RealtimeRefresher'
import { NotificationPrompt } from '@/components/notifications/NotificationPrompt'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <>
      <RefreshOnFocus />
      <RealtimeRefresher />
      <NotificationPrompt />
      {children}
    </>
  )
}
