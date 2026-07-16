// src/lib/actions/trips.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { foreignToTwdRate, FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import { LEDGER_TYPE_VALUES } from '@/lib/utils/ledger-type'
import type { ForeignCurrency, LedgerType } from '@/types/database'

export async function createTripAction(formData: FormData) {
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const dateMode = formData.get('date_mode') as string
  let startDate = (formData.get('start_date') as string) || null
  let endDate = (formData.get('end_date') as string) || null
  if (dateMode === 'single') endDate = startDate
  if (dateMode === 'none') { startDate = null; endDate = null }

  if (!name?.trim()) return { error: '請輸入帳本名稱' }
  if (!(LEDGER_TYPE_VALUES as readonly string[]).includes(type)) return { error: '請選擇帳本類型' }

  // FX off = no foreign_currency field submitted → both null (pure-TWD ledger)
  const foreignCurrency = (formData.get('foreign_currency') as string) || null
  let exchangeRate: number | null = null
  if (foreignCurrency !== null) {
    if (!(FOREIGN_CURRENCIES as readonly string[]).includes(foreignCurrency)) {
      return { error: '請選擇有效外幣' }
    }
    exchangeRate = parseFloat(formData.get('exchange_rate') as string)
    if (isNaN(exchangeRate) || exchangeRate <= 0) return { error: '請輸入有效匯率' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_type: type as LedgerType,
    p_exchange_rate: exchangeRate,
    p_foreign_currency: foreignCurrency,
    p_start_date: startDate,
    p_end_date: endDate,
  })

  if (error) return { error: error.message }
  redirect(`/trips/${data}`)
}

export async function updateTripInfoAction(tripId: string, formData: FormData) {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || null
  const dateMode = formData.get('date_mode') as string
  let startDate = (formData.get('start_date') as string) || null
  let endDate = (formData.get('end_date') as string) || null
  if (dateMode === 'single') endDate = startDate
  if (dateMode === 'none') { startDate = null; endDate = null }

  if (!name?.trim()) return { error: '請輸入帳本名稱' }
  if (type !== null && !(LEDGER_TYPE_VALUES as readonly string[]).includes(type)) {
    return { error: '請選擇帳本類型' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_trip_info', {
    p_trip_id: tripId,
    p_name: name.trim(),
    p_start_date: startDate,
    p_end_date: endDate,
    p_type: type as LedgerType | null,
  })

  if (error) return { error: error.message }
  revalidatePath(`/trips/${tripId}`)
  revalidatePath('/trips')
  return { success: true }
}

/** 抓 USD 基準匯率表，回傳每個外幣→TWD 匯率（抓不到為 null）。 */
export async function fetchForeignRates(): Promise<Record<ForeignCurrency, number | null>> {
  const empty = Object.fromEntries(
    FOREIGN_CURRENCIES.map(c => [c, null]),
  ) as Record<ForeignCurrency, number | null>
  try {
    const res = await fetch('https://tw.rter.info/capi.php', { next: { revalidate: 3600 } })
    const json = (await res.json()) as Record<string, { Exrate: number }>
    const usdRates = Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, v?.Exrate]),
    ) as Record<string, number>
    return Object.fromEntries(
      FOREIGN_CURRENCIES.map(c => [c, foreignToTwdRate(usdRates, c)]),
    ) as Record<ForeignCurrency, number | null>
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
  if (error) {
    if (error.message.includes('NO_FOREIGN_CURRENCY')) return { error: '此帳本未使用外幣' }
    return { error: error.message }
  }
  revalidatePath(`/trips/${tripId}`)
  revalidatePath(`/trips/${tripId}/balance`)
  return { success: true }
}

/** Switch a trip's foreign currency + rate. Server rejects if the trip already has expenses. */
export async function updateTripCurrencyAction(tripId: string, currency: string, rate: number) {
  if (!(FOREIGN_CURRENCIES as readonly string[]).includes(currency)) return { error: '請選擇有效外幣' }
  if (!(rate > 0)) return { error: '匯率必須大於 0' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_trip_currency', {
    p_trip_id: tripId,
    p_foreign_currency: currency,
    p_rate: rate,
  })
  if (error) {
    if (error.message.includes('HAS_EXPENSES')) return { error: '已有費用，無法變更幣別' }
    return { error: error.message }
  }
  revalidatePath(`/trips/${tripId}`)
  revalidatePath(`/trips/${tripId}/balance`)
  revalidatePath('/trips')
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
  if (count === 0) throw new Error('只有帳本建立者可以刪除帳本')

  revalidatePath('/trips')
  redirect('/trips')
}
