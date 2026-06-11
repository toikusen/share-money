// src/lib/actions/trips.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createTripAction(formData: FormData) {
  const name = formData.get('name') as string
  const rateStr = formData.get('exchange_rate') as string
  const exchangeRate = parseFloat(rateStr)

  if (!name?.trim()) return { error: '請輸入行程名稱' }
  if (isNaN(exchangeRate) || exchangeRate <= 0) return { error: '請輸入有效匯率' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_exchange_rate: exchangeRate,
  })

  if (error) return { error: error.message }
  redirect(`/trips/${data}`)
}

export async function fetchExchangeRate(): Promise<number | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=JPY&to=TWD', {
      next: { revalidate: 3600 },
    })
    const json = await res.json()
    return json.rates?.TWD ?? null
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
  return { success: true }
}
