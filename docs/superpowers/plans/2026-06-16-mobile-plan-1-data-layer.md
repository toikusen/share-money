# Mobile App — Plan 1: Data Layer Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Server Actions and SSR Supabase client, replacing them with a unified client-side Supabase SDK so the web app works identically without a server-side data layer.

**Architecture:** Replace `@supabase/ssr` and server-side `createClient()` with a singleton `@supabase/supabase-js` browser client. All `lib/actions/*.ts` drop `'use server'` and call the browser client directly. All page components become Client Components fetching data via `useEffect`. Auth guard moves to a client-side `useEffect` in `app/(app)/layout.tsx`. `auth/callback/route.ts` becomes a client-side `page.tsx`.

**Tech Stack:** Next.js 16, @supabase/supabase-js, React 19, Vitest

---

## File Map

| File | Action |
|------|--------|
| `src/lib/supabase/client.ts` | Rewrite — direct supabase-js singleton |
| `src/lib/supabase/server.ts` | Delete |
| `src/lib/actions/trips.ts` | Remove `'use server'`, use browser client, return redirectTo |
| `src/lib/actions/expenses.ts` | Remove `'use server'`, use browser client |
| `src/lib/actions/members.ts` | Remove `'use server'`, use browser client, return redirectTo |
| `src/lib/actions/profile.ts` | Remove `'use server'`, use browser client |
| `src/app/(auth)/auth/callback/route.ts` | Delete |
| `src/app/(auth)/auth/callback/page.tsx` | Create — client-side code exchange |
| `src/app/(app)/layout.tsx` | Client Component — useEffect auth guard |
| `src/app/(app)/trips/page.tsx` | Client Component — useEffect data fetch |
| `src/app/(app)/trips/[id]/page.tsx` | Client Component — useEffect data fetch |
| `src/app/(app)/trips/[id]/balance/page.tsx` | Client Component — useEffect data fetch |
| `src/app/(app)/trips/[id]/activity/page.tsx` | Client Component — useEffect data fetch |
| `src/app/(app)/trips/new/page.tsx` | Client Component — useTransition form |
| `src/app/(auth)/login/page.tsx` | Client Component — client-side signInWithOAuth |
| `src/app/(auth)/join/[token]/page.tsx` | Client Component — useTransition form |
| `src/app/(app)/settings/page.tsx` | Client Component — useEffect data fetch |
| `src/components/settings/SignOutButton.tsx` | Add useRouter, push to /login after signOut |
| `src/components/settings/DisplayNameForm.tsx` | Add router.refresh() after success |
| `src/components/trips/DeleteTripButton.tsx` | Change action prop type, use onClick |

---

### Task 1: Replace Supabase browser client

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Delete: `src/lib/supabase/server.ts`

- [ ] **Step 1: Write the replacement client**

```typescript
// src/lib/supabase/client.ts
import { createClient as _createClient } from '@supabase/supabase-js'

let _instance: ReturnType<typeof _createClient> | null = null

export function createClient() {
  if (!_instance) {
    _instance = _createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _instance
}
```

- [ ] **Step 2: Delete server client**

```bash
rm src/lib/supabase/server.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/client.ts
git rm src/lib/supabase/server.ts
git commit -m "refactor(supabase): replace @supabase/ssr browser client with direct supabase-js singleton"
```

---

### Task 2: Refactor lib/actions/trips.ts

**Files:**
- Modify: `src/lib/actions/trips.ts`

Key changes: remove `'use server'`, import browser client, change `await createClient()` to `createClient()`, replace `redirect()` with `return { success: true, redirectTo }`, remove `revalidatePath` (callers use `router.refresh()`). `fetchExchangeRate` removes `next: { revalidate }` (not valid in browser).

- [ ] **Step 1: Rewrite the file**

```typescript
// src/lib/actions/trips.ts
import { createClient } from '@/lib/supabase/client'

export async function createTripAction(formData: FormData) {
  const name = formData.get('name') as string
  const rateStr = formData.get('exchange_rate') as string
  const exchangeRate = parseFloat(rateStr)
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!name?.trim()) return { error: '請輸入行程名稱' }
  if (isNaN(exchangeRate) || exchangeRate <= 0) return { error: '請輸入有效匯率' }

  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_exchange_rate: exchangeRate,
    ...(startDate ? { p_start_date: startDate } : {}),
    ...(endDate ? { p_end_date: endDate } : {}),
  })

  if (error) return { error: error.message }
  return { success: true, redirectTo: `/trips/${data}` }
}

export async function updateTripInfoAction(tripId: string, formData: FormData) {
  const name = formData.get('name') as string
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!name?.trim()) return { error: '請輸入行程名稱' }

  const supabase = createClient()
  const { error } = await supabase.rpc('update_trip_info', {
    p_trip_id: tripId,
    p_name: name.trim(),
    ...(startDate ? { p_start_date: startDate } : {}),
    ...(endDate ? { p_end_date: endDate } : {}),
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function fetchExchangeRate(): Promise<number | null> {
  try {
    const res = await fetch('https://tw.rter.info/capi.php')
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
  const supabase = createClient()
  const { error } = await supabase.rpc('update_trip_exchange_rate', {
    p_trip_id: tripId,
    p_rate: rate,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteTripAction(tripId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入', redirectTo: '/login' }

  const { error, count } = await supabase
    .from('trips')
    .delete({ count: 'exact' })
    .eq('id', tripId)
    .eq('created_by', user.id)

  if (error) return { error: error.message }
  if (count === 0) return { error: '只有行程建立者可以刪除行程' }
  return { success: true, redirectTo: '/trips' }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/trips.ts
git commit -m "refactor(actions): remove 'use server' from trips — use browser Supabase client"
```

---

### Task 3: Refactor lib/actions/expenses.ts

**Files:**
- Modify: `src/lib/actions/expenses.ts`

- [ ] **Step 1: Rewrite the file**

```typescript
// src/lib/actions/expenses.ts
import { createClient } from '@/lib/supabase/client'
import { validateExpenseInput } from '@/lib/utils/expenses'
import type { SplitInput, Currency } from '@/types/database'

const RPC_ERROR_MESSAGES: Record<string, string> = {
  NOT_MEMBER: '你不是此行程成員',
  NOT_OWNER: '只有建立者可以編輯或刪除此費用',
  PAID_BY_NOT_MEMBER: '付款人不是行程成員',
  SPLIT_USER_NOT_MEMBER: '分擔成員中有非行程成員',
  SPLIT_SUM_MISMATCH: '分擔金額總和不等於費用金額',
  JPY_SPLIT_NOT_INTEGER: 'JPY 金額必須為整數',
  PAID_AT_REQUIRED: '請選擇付款時間',
}

function mapRpcError(message: string): string {
  const key = Object.keys(RPC_ERROR_MESSAGES).find(k => message.includes(k))
  return key ? RPC_ERROR_MESSAGES[key] : message
}

function normalizePaidAt(paidAt: string): string | null {
  const paidAtDate = new Date(paidAt)
  return paidAt && !Number.isNaN(paidAtDate.getTime()) ? paidAtDate.toISOString() : null
}

export async function createExpenseAction(params: {
  tripId: string
  title: string
  amount: number
  currency: Currency
  paidBy: string
  paidAt: string
  splits: SplitInput[]
}) {
  const { tripId, title, amount, currency, paidBy, paidAt, splits } = params
  const validationError = validateExpenseInput({ title, amount, splits })
  if (validationError) return { error: validationError }
  const paidAtIso = normalizePaidAt(paidAt)
  if (!paidAtIso) return { error: '請選擇付款時間' }

  const supabase = createClient()
  const { error } = await supabase.rpc('create_expense_with_splits', {
    p_trip_id: tripId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_paid_at: paidAtIso,
    p_splits: splits,
  })

  if (error) return { error: mapRpcError(error.message) }
  return { success: true }
}

export async function updateExpenseAction(params: {
  expenseId: string
  tripId: string
  title: string
  amount: number
  currency: Currency
  paidBy: string
  paidAt: string
  splits: SplitInput[]
}) {
  const { expenseId, tripId, title, amount, currency, paidBy, paidAt, splits } = params
  const validationError = validateExpenseInput({ title, amount, splits })
  if (validationError) return { error: validationError }
  const paidAtIso = normalizePaidAt(paidAt)
  if (!paidAtIso) return { error: '請選擇付款時間' }

  const supabase = createClient()
  const { error } = await supabase.rpc('update_expense_with_splits', {
    p_expense_id: expenseId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_paid_at: paidAtIso,
    p_splits: splits,
  })

  if (error) return { error: mapRpcError(error.message) }
  return { success: true }
}

export async function deleteExpenseAction(expenseId: string, tripId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_expense', { p_expense_id: expenseId })
  if (error) return { error: mapRpcError(error.message) }
  return { success: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/expenses.ts
git commit -m "refactor(actions): remove 'use server' from expenses — use browser Supabase client"
```

---

### Task 4: Refactor lib/actions/members.ts and profile.ts

**Files:**
- Modify: `src/lib/actions/members.ts`
- Modify: `src/lib/actions/profile.ts`

- [ ] **Step 1: Rewrite members.ts**

```typescript
// src/lib/actions/members.ts
import { createClient } from '@/lib/supabase/client'

export async function joinTripAction(inviteToken: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入', redirectTo: `/login?next=${encodeURIComponent(`/join/${inviteToken}`)}` }

  const { data, error } = await supabase.rpc('join_trip', { p_invite_token: inviteToken })

  if (error) {
    if (error.message.includes('INVALID_TOKEN')) return { error: 'INVALID_TOKEN', redirectTo: '/join/invalid' }
    return { error: error.message }
  }

  return { success: true, redirectTo: `/trips/${data}` }
}
```

- [ ] **Step 2: Rewrite profile.ts**

```typescript
// src/lib/actions/profile.ts
import { createClient } from '@/lib/supabase/client'
import { validateDisplayName } from '@/lib/utils/profile'

export async function updateDisplayNameAction(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入' }

  const validation = validateDisplayName(formData.get('display_name'))
  if (!validation.ok) return { error: validation.error }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: validation.value })
    .eq('id', user.id)

  if (error) {
    console.error('Failed to update display name', error)
    return { error: '更新失敗，請稍後再試' }
  }
  return { success: true }
}

export async function signOutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/members.ts src/lib/actions/profile.ts
git commit -m "refactor(actions): remove 'use server' from members and profile — use browser Supabase client"
```

---

### Task 5: Replace auth/callback route handler with client page

**Files:**
- Delete: `src/app/(auth)/auth/callback/route.ts`
- Create: `src/app/(auth)/auth/callback/page.tsx`

- [ ] **Step 1: Delete route handler**

```bash
git rm src/app/(auth)/auth/callback/route.ts
```

- [ ] **Step 2: Create client-side callback page**

```tsx
// src/app/(auth)/auth/callback/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/trips'
    if (!code) { router.replace('/login'); return }

    createClient().auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        router.replace(error ? '/login' : next)
      })
  }, [router, searchParams])

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface">
      <p className="text-sm text-ink-3">登入中…</p>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/auth/callback/page.tsx
git commit -m "refactor(auth): replace route handler with client-side callback page"
```

---

### Task 6: Convert app/(app)/layout.tsx to client auth guard

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Rewrite layout**

```tsx
// src/app/(app)/layout.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RefreshOnFocus } from '@/components/realtime/RefreshOnFocus'
import { RealtimeRefresher } from '@/components/realtime/RealtimeRefresher'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
    })
  }, [router])

  return (
    <>
      <RefreshOnFocus />
      <RealtimeRefresher />
      {children}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/layout.tsx
git commit -m "refactor(layout): replace server auth guard with client-side useEffect"
```

---

### Task 7: Convert app/(auth)/login/page.tsx to client component

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Rewrite login page**

```tsx
// src/app/(auth)/login/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(searchParams.get('next') ?? '/trips')
    })
  }, [router, searchParams])

  async function signIn() {
    const next = searchParams.get('next') ?? '/trips'
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', next)

    await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface px-6">
      <div className="flex flex-col items-center mb-10">
        <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-5 shadow-card">
          <svg width="44" height="32" viewBox="0 0 22 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="8" r="6" fill="white" fillOpacity="0.3"/>
            <circle cx="15" cy="8" r="6" fill="white"/>
            <line x1="15" y1="3.5" x2="15" y2="12.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M17.5 5.5C17.5 4.5 16.5 4 15 4C13.5 4 12.5 4.7 12.5 6C12.5 7 13.5 7.5 15 8C16.5 8.5 17.5 9 17.5 10C17.5 11.3 16.5 12 15 12C13.5 12 12.5 11.5 12.5 10.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-1 select-none text-ink">
          share<span className="text-ink-4 font-normal mx-1">·</span>money
        </h1>
        <p className="text-sm text-ink-3">旅遊分帳，輕鬆不傷感情</p>
      </div>
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm">
        <button
          type="button"
          onClick={signIn}
          className="w-full flex items-center justify-center gap-3 bg-white rounded-xl px-4 py-3 text-sm font-medium text-ink-2 shadow-card ring-1 ring-line hover:shadow-card-hover hover:text-ink transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 shrink-0" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          使用 Google 帳號登入
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "refactor(login): convert to client component with client-side OAuth trigger"
```

---

### Task 8: Convert trips/page.tsx to client component

**Files:**
- Modify: `src/app/(app)/trips/page.tsx`

- [ ] **Step 1: Rewrite trips list page**

```tsx
// src/app/(app)/trips/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TripCard } from '@/components/trips/TripCard'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Trip } from '@/types/database'

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: memberships } = await supabase
        .from('trip_members').select('trip_id').eq('user_id', user.id)
      const tripIds = memberships?.map(m => m.trip_id) ?? []

      const { data } = await supabase
        .from('trips').select('*')
        .in('id', tripIds.length > 0 ? tripIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })

      setTrips(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <main className="max-w-lg mx-auto px-5 pt-6 pb-10"><p className="text-sm text-ink-4 py-16 text-center">載入中…</p></main>

  return (
    <main className="max-w-lg mx-auto px-5 pt-6 pb-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="8" r="6" fill="white" fillOpacity="0.3"/>
              <circle cx="15" cy="8" r="6" fill="white"/>
              <line x1="15" y1="3.5" x2="15" y2="12.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M17.5 5.5C17.5 4.5 16.5 4 15 4C13.5 4 12.5 4.7 12.5 6C12.5 7 13.5 7.5 15 8C16.5 8.5 17.5 9 17.5 10C17.5 11.3 16.5 12 15 12C13.5 12 12.5 11.5 12.5 10.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight select-none text-ink">
            share<span className="text-ink-4 mx-0.5 font-normal">·</span>money
          </span>
        </div>
        <Link href="/settings" aria-label="設定" className="p-2 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-fill transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </Link>
      </div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-[21px] font-bold tracking-tight text-ink">我的行程</h1>
        <Link href="/trips/new" className="inline-flex items-center gap-1.5 bg-accent text-white text-[13px] font-semibold px-4 py-2 rounded-full hover:bg-accent-deep active:scale-95 transition-all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          新增行程
        </Link>
      </div>
      {trips.length === 0 ? (
        <p className="text-center text-sm text-ink-4 py-16">還沒有行程，點右上角建立第一個</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {trips.map(trip => <TripCard key={trip.id} trip={trip} currentUserId={userId!} />)}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/trips/page.tsx
git commit -m "refactor(trips): convert trips list page to client component"
```

---

### Task 9: Convert trips/[id]/page.tsx to client component

**Files:**
- Modify: `src/app/(app)/trips/[id]/page.tsx`

- [ ] **Step 1: Rewrite trip detail page**

Replace the entire file. The page now: reads `id` from `useParams()`, fetches all data via `useEffect`, uses `useRouter` for `updateRate` form submission and `deleteTripAction`.

```tsx
// src/app/(app)/trips/[id]/page.tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { updateExchangeRateAction, deleteTripAction } from '@/lib/actions/trips'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { ExpenseList, type ExpenseDisplayRow } from '@/components/expenses/ExpenseList'
import { DailySpendChart } from '@/components/expenses/DailySpendChart'
import { InviteCard } from '@/components/trips/InviteCard'
import { DeleteTripButton } from '@/components/trips/DeleteTripButton'
import { EditTripInfoButton } from '@/components/trips/EditTripInfoButton'
import { calculateMemberStats } from '@/lib/utils/balance'
import { avatarBg, avatarFg, avatarChar } from '@/lib/utils/avatar'
import Link from 'next/link'
import type { Trip } from '@/types/database'

type MemberProfile = { id: string; display_name: string; avatar_url: string | null; created_at: string }

export default function TripPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [expenses, setExpenses] = useState<ExpenseDisplayRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rateError, setRateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function loadData() {
    const supabase = createClient()
    const [{ data: { user } }, { data: tripData }, { data: memberships }, { data: expensesData }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase.from('trips').select('*').eq('id', id).single(),
        supabase.from('trip_members').select('user_id, profiles(id, display_name, avatar_url, created_at)').eq('trip_id', id),
        supabase.from('expenses').select('*, expense_splits(*), payer:profiles!paid_by(id, display_name, avatar_url, created_at)').eq('trip_id', id).order('paid_at', { ascending: false }).order('created_at', { ascending: false }),
      ])

    if (!tripData) { notFound(); return }
    setUserId(user?.id ?? null)
    setTrip(tripData)
    setMembers((memberships?.map(m => m.profiles).filter(Boolean) ?? []) as unknown as MemberProfile[])
    setExpenses((expensesData ?? []) as unknown as ExpenseDisplayRow[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  if (loading || !trip || !userId) return <main className="max-w-lg mx-auto px-5 py-7"><p className="text-sm text-ink-4 py-16 text-center">載入中…</p></main>

  const inviteUrl = `${window.location.origin}/join/${trip.invite_token}`
  const canDeleteTrip = trip.created_by === userId
  const statRows = expenses.map(e => ({ id: e.id, amount: e.amount, currency: e.currency, paid_by: e.paid_by }))
  const splitRows = expenses.flatMap(e => e.expense_splits.map(s => ({ expense_id: e.id, user_id: s.user_id, amount: s.amount })))
  const stats = calculateMemberStats(statRows, splitRows, trip.exchange_rate)
  const myNet = stats.find(s => s.userId === userId)?.netTWD ?? 0
  const settled = Math.abs(myNet) < 0.005
  const netWord = settled ? '已結清' : myNet > 0 ? '你應收' : '你應付'
  const netClass = settled ? 'text-ink-3' : myNet > 0 ? 'text-gain' : 'text-owe'
  const netAmount = settled ? '—' : `NT$${Math.round(Math.abs(myNet)).toLocaleString('zh-TW')}`

  function handleUpdateRate(formData: FormData) {
    const rate = parseFloat(formData.get('rate') as string)
    setRateError(null)
    startTransition(async () => {
      const result = await updateExchangeRateAction(id, rate)
      if (result.error) { setRateError(result.error); return }
      await loadData()
    })
  }

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="mb-5">
        <Link href="/trips" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink-2 mb-4 transition-colors py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          行程
        </Link>
        <div className="flex items-start justify-between gap-2">
          {canDeleteTrip ? (
            <EditTripInfoButton tripId={id} initialName={trip.name} initialStartDate={trip.start_date} initialEndDate={trip.end_date} onSuccess={loadData} />
          ) : (
            <div><h1 className="text-[23px] font-bold tracking-tight text-ink leading-snug">{trip.name}</h1></div>
          )}
          {canDeleteTrip && (
            <DeleteTripButton
              onConfirm={async () => {
                const result = await deleteTripAction(id)
                if (result.error) return
                if (result.redirectTo) router.push(result.redirectTo)
              }}
              label="刪除行程"
              iconOnly
            />
          )}
        </div>
      </div>
      <Link href={`/trips/${id}/balance`} className="flex items-center justify-between bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11.5px] text-ink-3">目前結算 · {netWord}</span>
          <span className={`text-xl font-bold font-mono tabular-nums ${netClass}`}>{netAmount}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
          結算帳目
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </span>
      </Link>
      <DailySpendChart expenses={expenses.map(e => ({ paid_at: e.paid_at, amount: e.amount, currency: e.currency }))} exchangeRate={trip.exchange_rate} startDate={trip.start_date} endDate={trip.end_date} />
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center" aria-label={`成員 ${members.length} 人`}>
          {members.map(m => (
            <span key={m.id} role="img" aria-label={m.display_name} className="h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center ring-2 ring-surface -ml-1.5 first:ml-0 select-none" style={{ background: avatarBg(m.id), color: avatarFg(m.id) }}>
              {avatarChar(m.display_name)}
            </span>
          ))}
        </div>
        <InviteCard inviteUrl={inviteUrl} />
      </div>
      <form action={handleUpdateRate} className="flex items-center gap-1.5 text-xs text-ink-3 mt-3">
        <span>匯率 1 JPY =</span>
        <input name="rate" type="number" step="0.0001" defaultValue={trip.exchange_rate} className="w-20 bg-fill border-0 rounded-md px-2 py-1 text-xs text-ink text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/35" />
        <span>TWD</span>
        <button type="submit" disabled={isPending} className="ml-1 text-accent hover:text-accent-deep text-xs font-medium transition-colors">更新</button>
        {rateError && <span className="text-owe text-xs">{rateError}</span>}
      </form>
      <section className="mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-ink-2">費用明細 <span className="font-normal text-ink-4">· {expenses.length} 筆</span></h2>
          <div className="flex items-center gap-2">
            <Link href={`/trips/${id}/activity`} aria-label="編輯紀錄" className="p-2 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-fill transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
            </Link>
            <AddExpenseModal tripId={id} members={members} currentUserId={userId} compact onSuccess={loadData} />
          </div>
        </div>
        {expenses.length === 0 && <p className="text-center text-sm text-ink-4 py-10">還沒有費用，點「記一筆」開始</p>}
        <ExpenseList tripId={id} expenses={expenses} members={members} currentUserId={userId} exchangeRate={trip.exchange_rate} onMutate={loadData} />
      </section>
    </main>
  )
}
```

> **Note:** `EditTripInfoButton`, `AddExpenseModal`, and `ExpenseList` need to accept an `onSuccess`/`onMutate` callback prop instead of relying on `revalidatePath`. Check each component and add `onSuccess?: () => void` prop that calls `loadData()`. This is needed for these 3 components — look for any `revalidatePath` usage in them and replace with calling the prop.

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/trips/[id]/page.tsx
git commit -m "refactor(trips): convert trip detail page to client component"
```

---

### Task 10: Convert balance, activity, new trip, join, settings pages

**Files:**
- Modify: `src/app/(app)/trips/[id]/balance/page.tsx`
- Modify: `src/app/(app)/trips/[id]/activity/page.tsx`
- Modify: `src/app/(app)/trips/new/page.tsx`
- Modify: `src/app/(auth)/join/[token]/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

The pattern for balance and activity pages is identical to the trip detail page: add `'use client'`, read `id` from `useParams()`, move data fetching to `useEffect`.

- [ ] **Step 1: Convert balance/page.tsx**

Add `'use client'` at the top. Replace `async function BalancePage({ params })` with:
```tsx
'use client'
// ... existing imports, plus:
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function BalancePage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<{ trip: any; members: any[]; expenses: any[]; meId: string } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: { user } }, { data: trip }, { data: memberships }, { data: expenses }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.from('trips').select('*').eq('id', id).single(),
          supabase.from('trip_members').select('user_id, profiles(id, display_name)').eq('trip_id', id),
          supabase.from('expenses')
            .select('id, amount, currency, paid_by, expense_splits(expense_id, user_id, amount)')
            .eq('trip_id', id),
        ])

      const memberProfiles = (memberships?.map(m => m.profiles).filter(Boolean) ?? []) as { id: string; display_name: string }[]
      setData({ trip, members: memberProfiles, expenses: expenses ?? [], meId: user!.id })
    }
    load()
  }, [id])

  if (!data) return <main className="max-w-lg mx-auto px-5 py-7"><p className="text-sm text-ink-4 py-16 text-center">載入中…</p></main>

  const { trip, members, expenses: expRows, meId } = data
  if (!trip) return null

  // ... rest of the JSX from original page, unchanged
```

Keep all the balance calculation logic and JSX from the original page unchanged. Only change: reading `id` from `useParams`, data fetching moved to `useEffect`.

- [ ] **Step 2: Convert activity/page.tsx**

Same pattern as balance page: add `'use client'`, use `useParams`, `useEffect`.

- [ ] **Step 3: Convert trips/new/page.tsx**

```tsx
// src/app/(app)/trips/new/page.tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTripAction, fetchExchangeRate } from '@/lib/actions/trips'
import Link from 'next/link'

const inputClass = 'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

export default function NewTripPage() {
  const [rate, setRate] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => { fetchExchangeRate().then(setRate) }, [])

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createTripAction(formData)
      if (result.error) { setError(result.error); return }
      if (result.redirectTo) router.push(result.redirectTo)
    })
  }

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-6">
        <Link href="/trips" aria-label="返回行程" className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <h1 className="text-base font-bold text-ink">新增行程</h1>
      </div>
      <form action={handleSubmit} className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
        <div>
          <label htmlFor="new-trip-name" className="block text-xs font-medium text-ink-3 mb-1.5">行程名稱</label>
          <input id="new-trip-name" name="name" type="text" required placeholder="東京五日遊" className={inputClass} />
        </div>
        <div>
          <p className="text-xs font-medium text-ink-3 mb-1.5">日期區間<span className="text-ink-4 font-normal ml-1">（選填）</span></p>
          <div className="flex items-center gap-2">
            <input name="start_date" type="date" aria-label="開始日期" className={`${inputClass} flex-1`} />
            <span className="text-ink-4 text-sm shrink-0" aria-hidden="true">–</span>
            <input name="end_date" type="date" aria-label="結束日期" className={`${inputClass} flex-1`} />
          </div>
        </div>
        <div>
          <label htmlFor="new-trip-rate" className="block text-xs font-medium text-ink-3 mb-1.5">匯率（1 JPY = ? TWD）</label>
          <input id="new-trip-rate" name="exchange_rate" type="number" step="0.0001" min="0.0001" required defaultValue={rate ?? ''} placeholder={rate ? String(rate) : '請手動輸入'} className={`${inputClass} font-mono tabular-nums`} />
        </div>
        {error && <p className="text-sm text-owe">{error}</p>}
        <button type="submit" disabled={isPending} className="w-full bg-accent text-white py-3 rounded-xl text-sm font-semibold hover:bg-accent-deep transition-colors disabled:opacity-50">
          {isPending ? '建立中…' : '建立行程'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Convert join/[token]/page.tsx**

```tsx
// src/app/(auth)/join/[token]/page.tsx
'use client'

import { useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { joinTripAction } from '@/lib/actions/members'

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleJoin() {
    startTransition(async () => {
      const result = await joinTripAction(token)
      if (result.redirectTo) router.replace(result.redirectTo)
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-5">
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm text-center flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center">
          <svg width="32" height="24" viewBox="0 0 22 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="8" r="6" fill="white" fillOpacity="0.3"/>
            <circle cx="15" cy="8" r="6" fill="white"/>
            <line x1="15" y1="3.5" x2="15" y2="12.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M17.5 5.5C17.5 4.5 16.5 4 15 4C13.5 4 12.5 4.7 12.5 6C12.5 7 13.5 7.5 15 8C16.5 8.5 17.5 9 17.5 10C17.5 11.3 16.5 12 15 12C13.5 12 12.5 11.5 12.5 10.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink mb-1">加入行程</h1>
          <p className="text-sm text-ink-3">點下方按鈕加入此行程</p>
        </div>
        <button type="button" onClick={handleJoin} disabled={isPending} className="w-full bg-accent text-white py-3 rounded-xl text-sm font-semibold hover:bg-accent-deep transition-colors disabled:opacity-50">
          {isPending ? '加入中…' : '確認加入'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Convert settings/page.tsx**

```tsx
// src/app/(app)/settings/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DisplayNameForm } from '@/components/settings/DisplayNameForm'
import { SignOutButton } from '@/components/settings/SignOutButton'
import Link from 'next/link'

export default function SettingsPage() {
  const [profile, setProfile] = useState<{ display_name: string } | null>(null)
  const [email, setEmail] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setEmail(user.email ?? '')
      const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      if (data) setProfile(data)
    }
    load()
  }, [router])

  if (!profile) return <main className="max-w-lg mx-auto px-5 py-7"><p className="text-sm text-ink-4 py-16 text-center">載入中…</p></main>

  const initial = email.charAt(0).toUpperCase()

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-6">
        <Link href="/trips" aria-label="返回行程" className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <h1 className="text-base font-bold text-ink">設定</h1>
      </div>
      <div className="flex flex-col gap-5">
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">顯示名稱</p>
          <div className="bg-white rounded-2xl shadow-card p-5">
            <DisplayNameForm initialName={profile.display_name} />
          </div>
        </section>
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">登入帳號</p>
          <div className="bg-white rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-fill flex items-center justify-center text-sm font-semibold text-ink-2 shrink-0">{initial}</div>
              <span className="text-sm text-ink truncate">{email}</span>
            </div>
            <SignOutButton />
          </div>
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Commit all page conversions**

```bash
git add src/app/(app)/trips/[id]/balance/page.tsx src/app/(app)/trips/[id]/activity/page.tsx src/app/(app)/trips/new/page.tsx src/app/(auth)/join/[token]/page.tsx src/app/(app)/settings/page.tsx
git commit -m "refactor(pages): convert all remaining pages to client components"
```

---

### Task 11: Update SignOutButton and DisplayNameForm

**Files:**
- Modify: `src/components/settings/SignOutButton.tsx`
- Modify: `src/components/settings/DisplayNameForm.tsx`

- [ ] **Step 1: Update SignOutButton to handle redirect**

```tsx
// src/components/settings/SignOutButton.tsx
'use client'

import { signOutAction } from '@/lib/actions/profile'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function SignOutButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => {
        await signOutAction()
        router.push('/login')
      })}
      className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-fill px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-owe/10 hover:text-owe disabled:opacity-50"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {isPending ? '登出中…' : '登出'}
    </button>
  )
}
```

- [ ] **Step 2: Update DisplayNameForm to call router.refresh()**

Add `useRouter` and call `router.refresh()` after success:

```tsx
// src/components/settings/DisplayNameForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateDisplayNameAction } from '@/lib/actions/profile'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/utils/profile'

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateDisplayNameAction(formData)
      if (result?.error) { setError(result.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="display_name" className="sr-only">顯示名稱</label>
        <input id="display_name" name="display_name" type="text" required maxLength={DISPLAY_NAME_MAX_LENGTH} defaultValue={initialName} className="w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35" />
        <p className="text-xs text-ink-4 mt-1.5">其他成員會在行程與分帳中看到這個名稱</p>
      </div>
      {error && <p className="text-sm text-owe">{error}</p>}
      {saved && <p className="text-sm text-gain">已更新</p>}
      <button type="submit" disabled={isPending} className="self-start bg-accent text-white text-sm font-semibold px-4 py-2 rounded-[10px] hover:bg-accent-deep transition-colors disabled:opacity-50">
        {isPending ? '儲存中…' : '儲存'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SignOutButton.tsx src/components/settings/DisplayNameForm.tsx
git commit -m "refactor(components): add router navigation to SignOutButton and DisplayNameForm"
```

---

### Task 12: Update DeleteTripButton prop interface

**Files:**
- Modify: `src/components/trips/DeleteTripButton.tsx`

The component currently accepts `action: (formData: FormData) => void | Promise<void>` as a form action prop. Change to `onConfirm: () => Promise<void>` using `onClick`.

- [ ] **Step 1: Rewrite DeleteTripButton**

```tsx
// src/components/trips/DeleteTripButton.tsx
'use client'

import { useTransition } from 'react'

type DeleteTripButtonProps = {
  onConfirm: () => Promise<void>
  label?: string
  iconOnly?: boolean
}

export function DeleteTripButton({ onConfirm, label = '刪除', iconOnly }: DeleteTripButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('確定要刪除這個行程嗎？所有費用與分帳資料都會一併刪除。')) return
    startTransition(onConfirm)
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={
        iconOnly
          ? 'p-1.5 rounded-lg text-ink-4/70 hover:text-owe hover:bg-owe/5 transition-colors disabled:opacity-50'
          : 'text-sm font-medium text-owe hover:opacity-80 transition-opacity disabled:opacity-50'
      }
      aria-label={iconOnly ? label : undefined}
    >
      {iconOnly ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      ) : label}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/trips/DeleteTripButton.tsx
git commit -m "refactor(DeleteTripButton): change form action prop to onConfirm callback"
```

---

### Task 13: Remove @supabase/ssr dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall the package**

```bash
npm uninstall @supabase/ssr
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "@supabase/ssr" src/
```

Expected: no output (zero matches).

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Build verify**

```bash
npm run build
```

Expected: build succeeds with no errors. Check that no server-side imports remain.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @supabase/ssr — all data fetching now uses client-side SDK"
```

---

### Task 14: Smoke test the web app

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify these flows work in browser**

1. Visit `http://localhost:3000` → redirects to `/login` (not a 404 or server error)
2. Click "使用 Google 帳號登入" → Google OAuth opens (in the same tab, not a new window)
3. Complete login → redirected to `/trips`
4. Create a new trip → redirected to trip detail page
5. Add an expense → expense appears in list
6. Click "結算帳目" → balance page loads with correct amounts
7. Click settings → profile page loads
8. Sign out → redirected to `/login`

- [ ] **Step 3: Commit if all good**

```bash
git add .
git commit -m "feat: data layer refactoring complete — all pages now use client-side Supabase"
```
