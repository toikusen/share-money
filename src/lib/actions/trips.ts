// src/lib/actions/trips.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createTripAction(formData: FormData) {
  const name = formData.get('name') as string
  const rateStr = formData.get('exchange_rate') as string
  const exchangeRate = parseFloat(rateStr)
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!name?.trim()) return { error: '請輸入行程名稱' }
  if (isNaN(exchangeRate) || exchangeRate <= 0) return { error: '請輸入有效匯率' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_exchange_rate: exchangeRate,
    ...(startDate ? { p_start_date: startDate } : {}),
    ...(endDate ? { p_end_date: endDate } : {}),
  })

  if (error) return { error: error.message }
  redirect(`/trips/${data}`)
}

export async function updateTripInfoAction(tripId: string, formData: FormData) {
  const name = formData.get('name') as string
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!name?.trim()) return { error: '請輸入行程名稱' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_trip_info', {
    p_trip_id: tripId,
    p_name: name.trim(),
    ...(startDate ? { p_start_date: startDate } : {}),
    ...(endDate ? { p_end_date: endDate } : {}),
  })

  if (error) return { error: error.message }
  revalidatePath(`/trips/${tripId}`)
  revalidatePath('/trips')
  return { success: true }
}

export async function fetchExchangeRate(): Promise<number | null> {
  try {
    const res = await fetch('https://tw.rter.info/capi.php', {
      next: { revalidate: 3600 },
    })
    const json = await res.json()
    const usdJpy: number = json['USDJPY']?.Exrate
    const usdTwd: number = json['USDTWD']?.Exrate
    if (!usdJpy || !usdTwd) return null
    return Math.round((usdTwd / usdJpy) * 10000) / 10000
  } catch {
    return null
  }
}

export async function updateExchangeRateAction(tripId: string, rate: number) {
  if (rate <= 0) return { error: '匯率必須大於 0' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_trip_exchange_rate', {
    p_trip_id: tripId,
    p_rate: rate,
  })
  if (error) return { error: error.message }
  revalidatePath(`/trips/${tripId}`)
  revalidatePath(`/trips/${tripId}/balance`)
  return { success: true }
}

export async function deleteTripAction(tripId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error, count } = await supabase
    .from('trips')
    .delete({ count: 'exact' })
    .eq('id', tripId)
    .eq('created_by', user.id)

  if (error) throw new Error(error.message)
  if (count === 0) throw new Error('只有行程建立者可以刪除行程')

  revalidatePath('/trips')
  redirect('/trips')
}
