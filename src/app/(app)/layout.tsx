import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getAuthUser } from '@/lib/supabase/server'
import { AdsenseScript } from '@/components/AdsenseScript'
import { DeferredAppEnhancements } from '@/components/realtime/DeferredAppEnhancements'
import Loading from './loading'

async function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  return (
    <>
      <DeferredAppEnhancements />
      {children}
      <AdsenseScript />
    </>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthenticatedApp>{children}</AuthenticatedApp>
    </Suspense>
  )
}
