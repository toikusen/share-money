// src/lib/actions/trips.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { foreignToTwdRate, FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import type { Currency } from '@/types/database'

export async function createTripAction(formData: FormData) {
  const name = formData.get('name') as string
  const rateStr = formData.get('exchange_rate') as string
  const exchangeRate = parseFloat(rateStr)
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!name?.trim()) return { error: '請輸入行程名稱' }
  if (isNaN(exchangeRate) || exchangeRate <= 0) return { error: '請輸入有效匯率' }

  const foreignCurrency = formData.get('foreign_currency') as string
  if (!(FOREIGN_CURRENCIES as readonly string[]).includes(foreignCurrency)) {
    return { error: '請選擇有效外幣' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_exchange_rate: exchangeRate,
    p_foreign_currency: foreignCurrency,
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

/** 抓 USD 基準匯率表，回傳每個外幣→TWD 匯率（抓不到為 null）。 */
export async function fetchForeignRates(): Promise<Record<Currency, number | null>> {
  const empty = Object.fromEntries(
    FOREIGN_CURRENCIES.map(c => [c, null]),
  ) as Record<Currency, number | null>
  try {
    const res = await fetch('https://tw.rter.info/capi.php', { next: { revalidate: 3600 } })
    const json = (await res.json()) as Record<string, { Exrate: number }>
    const usdRates = Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, v?.Exrate]),
    ) as Record<string, number>
    return Object.fromEntries(
      FOREIGN_CURRENCIES.map(c => [c, foreignToTwdRate(usdRates, c)]),
    ) as Record<Currency, number | null>
  } catch {
    return empty
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
