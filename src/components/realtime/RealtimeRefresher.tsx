'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createDebounce } from '@/lib/utils/timing'

/**
 * Subscribes to Realtime change events on expenses, expense_splits and
 * trip_members and re-fetches server data when other members write.
 * expense_splits covers approval status changes (approve/reject). INSERT/UPDATE
 * payloads are RLS-filtered to the user's own trips; DELETE events carry only
 * the row id, so we just refresh unconditionally.
 */
export function RealtimeRefresher() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const refresh = createDebounce(() => router.refresh(), 400)

    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members' }, refresh)
      .subscribe()

    return () => {
      refresh.cancel()
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
