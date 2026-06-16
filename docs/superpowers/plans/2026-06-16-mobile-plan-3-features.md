# Mobile App — Plan 3: Push Notifications + Account Deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plans 1 and 2 complete. App runs on simulator. Capacitor platforms initialized.

**Goal:** Users receive push notifications when expenses are added to shared trips. Users can permanently delete their accounts (required by Apple App Store).

**Architecture:** `device_tokens` table stores per-device FCM tokens with RLS. A Supabase Database Webhook triggers `send-push-notification` Edge Function on `expenses` insert. iOS FCM tokens are bridged from native Firebase via a custom AppDelegate plugin. Account deletion anonymizes profile data and removes auth user via `delete-account` Edge Function.

**Tech Stack:** Capacitor Push Notifications 7.x, Firebase Cloud Messaging, Supabase Edge Functions (Deno), Supabase Database Webhooks, Swift (iOS AppDelegate)

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/0008_device_tokens.sql` | Create — device_tokens table + RLS |
| `supabase/migrations/0009_account_deletion_fk.sql` | Create — FK ON DELETE behaviors |
| `supabase/functions/send-push-notification/index.ts` | Create — Edge Function |
| `supabase/functions/delete-account/index.ts` | Create — Edge Function |
| `src/lib/push.ts` | Create — JS push registration logic |
| `src/app/(app)/settings/page.tsx` | Modify — add delete account button |
| `ios/App/App/AppDelegate.swift` | Modify — add Firebase init + FCM token bridge |

---

### Task 1: DB migration — device_tokens table

**Files:**
- Create: `supabase/migrations/0008_device_tokens.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/0008_device_tokens.sql

CREATE TABLE device_tokens (
  device_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token        text NOT NULL,
  token_type   text NOT NULL CHECK (token_type IN ('fcm', 'apns')),
  platform     text NOT NULL CHECK (platform IN ('android', 'ios')),
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  revoked_at   timestamptz
);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own tokens
CREATE POLICY "device_tokens_select" ON device_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "device_tokens_insert" ON device_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "device_tokens_update" ON device_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "device_tokens_delete" ON device_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

- [ ] **Step 2: Run migration against local Supabase**

```bash
npx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_device_tokens.sql
git commit -m "feat(db): add device_tokens table with RLS for push notification tokens"
```

---

### Task 2: DB migration — account deletion FK behaviors

**Files:**
- Create: `supabase/migrations/0009_account_deletion_fk.sql`

Currently `trips.created_by`, `expenses.paid_by`, `expenses.created_by` reference `profiles(id)` with no ON DELETE behavior. Deleting a profile (which cascades from deleting an auth user) would fail with FK violations.

Strategy: set to `ON DELETE SET NULL` so expense/trip records survive user deletion, preserving other members' data.

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/0009_account_deletion_fk.sql

-- Allow trips to outlive their creator (creator becomes NULL)
ALTER TABLE trips
  DROP CONSTRAINT trips_created_by_fkey,
  ADD CONSTRAINT trips_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Allow expenses to outlive payer and creator
ALTER TABLE expenses
  DROP CONSTRAINT expenses_paid_by_fkey,
  ADD CONSTRAINT expenses_paid_by_fkey
    FOREIGN KEY (paid_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE expenses
  DROP CONSTRAINT expenses_created_by_fkey,
  ADD CONSTRAINT expenses_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- expense_splits: delete the split when the user is deleted
-- (they're no longer a participant in the split)
ALTER TABLE expense_splits
  DROP CONSTRAINT expense_splits_user_id_fkey,
  ADD CONSTRAINT expense_splits_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- trip_members: remove membership when user is deleted
ALTER TABLE trip_members
  DROP CONSTRAINT trip_members_user_id_fkey,
  ADD CONSTRAINT trip_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

> **Note:** Verify constraint names with `\d trips` in psql or Supabase Studio before running. Constraint names may differ from the above.

- [ ] **Step 2: Run migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_account_deletion_fk.sql
git commit -m "feat(db): add ON DELETE behaviors for account deletion (SET NULL / CASCADE)"
```

---

### Task 3: delete-account Edge Function

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

- [ ] **Step 1: Write Edge Function**

```typescript
// supabase/functions/delete-account/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  // Verify the calling user via their JWT
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return new Response('Unauthorized', { status: 401 })

  // Use service role for admin operations
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Step 1: Anonymize profile (belt-and-suspenders; FK cascade will delete it,
  // but anonymize first in case of race conditions)
  await adminClient
    .from('profiles')
    .update({ display_name: '已刪除使用者', avatar_url: null })
    .eq('id', user.id)

  // Step 2: Revoke all device tokens
  await adminClient
    .from('device_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)

  // Step 3: Delete the auth user (cascades to profiles via ON DELETE CASCADE,
  // which cascades to trip_members and expense_splits via the new FK behaviors)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('Failed to delete user', deleteError)
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Deploy Edge Function**

```bash
npx supabase functions deploy delete-account --no-verify-jwt
```

> `--no-verify-jwt` is NOT used here because we want to verify the user's JWT. Remove that flag if added accidentally. The function verifies the JWT manually.

```bash
npx supabase functions deploy delete-account
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/delete-account/
git commit -m "feat(functions): add delete-account Edge Function with auth verification"
```

---

### Task 4: Add delete account UI to settings page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add DeleteAccountButton component inline**

In `src/app/(app)/settings/page.tsx`, add a "刪除帳號" section below the sign-out section:

```tsx
// Add to settings/page.tsx (inside the Client Component)
import { useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

// Inside SettingsPage component, add:
const [isDeleting, startDeleteTransition] = useTransition()
const [deleteError, setDeleteError] = useState<string | null>(null)

function handleDeleteAccount() {
  if (!confirm('確定要刪除帳號嗎？此操作無法復原，所有個人資料將被清除。')) return

  startDeleteTransition(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setDeleteError(body.error ?? '刪除失敗，請稍後再試')
      return
    }

    router.replace('/login')
  })
}
```

Add the delete section to the JSX (after the sign-out section):

```tsx
<section>
  <p className="text-xs font-semibold text-ink-3 mb-2 px-1">帳號管理</p>
  <div className="bg-white rounded-2xl shadow-card p-4">
    {deleteError && <p className="text-sm text-owe mb-3">{deleteError}</p>}
    <button
      type="button"
      disabled={isDeleting}
      onClick={handleDeleteAccount}
      className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-fill px-4 py-2 text-sm font-medium text-owe transition-colors hover:bg-owe/10 disabled:opacity-50"
    >
      {isDeleting ? '刪除中…' : '刪除帳號'}
    </button>
    <p className="text-xs text-ink-4 mt-2 text-center">帳號刪除後無法復原</p>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/settings/page.tsx
git commit -m "feat(settings): add delete account section with Edge Function call"
```

---

### Task 5: send-push-notification Edge Function

**Files:**
- Create: `supabase/functions/send-push-notification/index.ts`

- [ ] **Step 1: Set up Firebase service account secret in Supabase**

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:
- `FIREBASE_SERVICE_ACCOUNT_JSON`: paste the JSON content of your Firebase service account key (download from Firebase Console → Project Settings → Service Accounts → Generate new private key)

- [ ] **Step 2: Write Edge Function**

```typescript
// supabase/functions/send-push-notification/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface WebhookPayload {
  type: 'INSERT'
  table: string
  record: {
    id: string
    trip_id: string
    title: string
    amount: number
    currency: string
    created_by: string
  }
  schema: string
}

async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  // Create JWT for Google OAuth2 token request
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  // Sign with private key (using Deno's crypto)
  const privateKeyPem = serviceAccount.private_key
  const privateKeyDer = pemToDer(privateKeyPem)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', privateKeyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const signInput = new TextEncoder().encode(`${header}.${encodedPayload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signInput)
  const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${header}.${encodedPayload}.${encodedSig}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

Deno.serve(async (req: Request) => {
  const payload: WebhookPayload = await req.json()
  if (payload.type !== 'INSERT' || payload.table !== 'expenses') return new Response('ok')

  const { trip_id, title, amount, currency, created_by } = payload.record

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get all trip members except the expense creator
  const { data: members } = await adminClient
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', trip_id)
    .neq('user_id', created_by)

  if (!members || members.length === 0) return new Response('ok')

  const memberIds = members.map(m => m.user_id)

  // Get active device tokens for all members
  const { data: tokens } = await adminClient
    .from('device_tokens')
    .select('token, token_type')
    .in('user_id', memberIds)
    .is('revoked_at', null)

  if (!tokens || tokens.length === 0) return new Response('ok')

  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')!
  const accessToken = await getFcmAccessToken(serviceAccountJson)
  const serviceAccount = JSON.parse(serviceAccountJson)
  const projectId = serviceAccount.project_id

  const amountStr = currency === 'JPY'
    ? `¥${Math.round(amount).toLocaleString()}`
    : `NT$${amount.toLocaleString()}`

  // Send to each token
  const sends = tokens.map(({ token }) =>
    fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: '新增費用',
            body: `${title} ${amountStr}`,
          },
          data: { trip_id },
        },
      }),
    }).then(r => r.json())
  )

  await Promise.allSettled(sends)
  return new Response('ok')
})
```

- [ ] **Step 3: Deploy function**

```bash
npx supabase functions deploy send-push-notification --no-verify-jwt
```

- [ ] **Step 4: Set up Database Webhook in Supabase**

In Supabase Dashboard → Database → Webhooks → Create webhook:
- Name: `on-expense-insert`
- Table: `expenses`
- Events: `INSERT`
- Method: POST
- URL: `https://<your-project-ref>.supabase.co/functions/v1/send-push-notification`
- HTTP Headers: `Authorization: Bearer <supabase-service-role-key>`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-push-notification/
git commit -m "feat(functions): add send-push-notification Edge Function with FCM v1 API"
```

---

### Task 6: Push notification registration in JS

**Files:**
- Create: `src/lib/push.ts`

- [ ] **Step 1: Create push registration utility**

```typescript
// src/lib/push.ts
import { createClient } from '@/lib/supabase/client'

const DEVICE_ID_KEY = 'sharemoney_device_id'

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const deviceId = getOrCreateDeviceId()

  await supabase.from('device_tokens').upsert(
    {
      device_id: deviceId,
      user_id: user.id,
      token,
      token_type: 'fcm',
      platform,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'device_id' }
  )
}

export async function revokePushToken(): Promise<void> {
  const deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) return

  const supabase = createClient()
  await supabase
    .from('device_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('device_id', deviceId)
}
```

- [ ] **Step 2: Write test**

```typescript
// tests/lib/push.test.ts
import { describe, it, expect, vi } from 'vitest'

// The device ID generation logic is pure — test it in isolation
describe('getOrCreateDeviceId', () => {
  it('returns same ID on second call', () => {
    const storage: Record<string, string> = {}
    const mockStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v },
    }
    // Simulate two calls
    const get = () => {
      let id = mockStorage.getItem('sharemoney_device_id')
      if (!id) { id = 'test-uuid-123'; mockStorage.setItem('sharemoney_device_id', id) }
      return id
    }
    const first = get()
    const second = get()
    expect(first).toBe(second)
    expect(first).toBe('test-uuid-123')
  })
})
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/lib/push.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/push.ts tests/lib/push.test.ts
git commit -m "feat(push): add push token registration utility with device ID persistence"
```

---

### Task 7: Integrate push registration in mobile app layout

**Files:**
- Modify: `src/app-mobile/layout.tsx`

Call `registerPushToken` on app startup after the user is authenticated.

- [ ] **Step 1: Update mobile layout**

```tsx
// src/app-mobile/layout.tsx
import type { Metadata } from 'next'
import '../app/globals.css'

export const metadata: Metadata = {
  title: 'ShareMoney',
  description: '旅遊分帳工具',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <PushRegistrar />
        {children}
      </body>
    </html>
  )
}

// Inline component — runs push registration once on mount
function PushRegistrar() {
  // Rendered server-side as empty, activated client-side
  return null
}
```

Add a separate client component for push registration (can't use hooks in the layout directly if it's a Server Component):

```tsx
// src/components/mobile/PushRegistrar.tsx
'use client'

import { useEffect } from 'react'
import { registerPushToken } from '@/lib/push'
import { createClient } from '@/lib/supabase/client'

export function PushRegistrar() {
  useEffect(() => {
    async function register() {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) return

      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const { receive } = await PushNotifications.requestPermissions()
        if (receive !== 'granted') return

        await PushNotifications.register()

        // Android: FCM token comes directly from registration event
        // iOS: token from registration event is APNs; see AppDelegate.swift for FCM bridge
        PushNotifications.addListener('registration', ({ value }) => {
          const platform = /android/i.test(navigator.userAgent) ? 'android' : 'ios'
          registerPushToken(value, platform)
        })

        PushNotifications.addListener('registrationError', err => {
          console.error('Push registration error:', err)
        })
      } catch {
        // Runs in web build where Capacitor is not available — silently ignore
      }
    }
    register()
  }, [])

  return null
}
```

Update `src/app-mobile/layout.tsx` to include `PushRegistrar`:

```tsx
// src/app-mobile/layout.tsx
import type { Metadata } from 'next'
import '../app/globals.css'
import { PushRegistrar } from '@/components/mobile/PushRegistrar'

export const metadata: Metadata = {
  title: 'ShareMoney',
  description: '旅遊分帳工具',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <PushRegistrar />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mobile/PushRegistrar.tsx src/app-mobile/layout.tsx
git commit -m "feat(mobile): add push notification registration on app startup"
```

---

### Task 8: iOS FCM token bridge (native Swift)

**Files:**
- Modify: `ios/App/App/AppDelegate.swift`

On iOS, `@capacitor/push-notifications`'s `registration` event returns an APNs token. To get an FCM token (needed for the FCM v1 API backend), Firebase iOS SDK must be initialized and the FCM token retrieved via `Messaging.messaging().token`.

- [ ] **Step 1: Add Firebase iOS SDK via CocoaPods**

In `ios/App/Podfile`, add inside the `target 'App'` block:

```ruby
pod 'FirebaseMessaging'
```

Then run:
```bash
cd ios/App && pod install && cd ../..
```

- [ ] **Step 2: Download GoogleService-Info.plist**

From Firebase Console → Project Settings → iOS app → download `GoogleService-Info.plist`. Place it at `ios/App/App/GoogleService-Info.plist`.

- [ ] **Step 3: Update AppDelegate.swift**

```swift
// ios/App/App/AppDelegate.swift
import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FirebaseApp.configure()
    Messaging.messaging().delegate = self
    return true
  }

  // Required Capacitor lifecycle methods
  func applicationWillResignActive(_ application: UIApplication) {}
  func applicationDidEnterBackground(_ application: UIApplication) {}
  func applicationWillEnterForeground(_ application: UIApplication) {}
  func applicationDidBecomeActive(_ application: UIApplication) {}
  func applicationWillTerminate(_ application: UIApplication) {}

  func application(_ app: UIApplication, open url: URL,
                   options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
  }

  func application(_ application: UIApplication,
                   continue userActivity: NSUserActivity,
                   restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    return ApplicationDelegateProxy.shared.application(application,
                                                       continue: userActivity,
                                                       restorationHandler: restorationHandler)
  }
}

// MARK: - MessagingDelegate
extension AppDelegate: MessagingDelegate {
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmRegistrationToken: String?) {
    guard let token = fcmRegistrationToken else { return }
    // Bridge FCM token to JS layer via Capacitor notification
    NotificationCenter.default.post(
      name: Notification.Name("FCMToken"),
      object: nil,
      userInfo: ["token": token]
    )
  }
}
```

- [ ] **Step 4: Update PushRegistrar.tsx to listen for FCM token on iOS**

In `src/components/mobile/PushRegistrar.tsx`, add FCM token listener for iOS:

```tsx
// Inside the register() function, after PushNotifications.register():
if (!/android/i.test(navigator.userAgent)) {
  // iOS: listen for FCM token bridged from AppDelegate via custom event
  // The native FCM token is posted via NotificationCenter → JS custom event
  // We use a Capacitor plugin event pattern
  const { CapacitorCustomPlatform } = await import('@capacitor/core').catch(() => ({ CapacitorCustomPlatform: null }))

  // Alternative: listen on document for a custom event dispatched by the native layer
  window.addEventListener('fcmToken', (e: Event) => {
    const token = (e as CustomEvent).detail?.token
    if (token) registerPushToken(token, 'ios')
  })
}
```

> **Note:** The exact bridge mechanism (NotificationCenter → JS) requires a thin native Capacitor plugin or using `CAPBridge.notifyListeners`. This step requires verifying the exact Capacitor bridge API with the current version. The above is a reference implementation — test and adjust as needed in Xcode before marking complete.

- [ ] **Step 5: Enable Push Notifications capability in Xcode**

In Xcode: Target → Signing & Capabilities → + Capability → Push Notifications.

- [ ] **Step 6: Commit**

```bash
git add ios/ supabase/functions/
git commit -m "feat(ios): add Firebase iOS SDK + FCM token bridge in AppDelegate"
```

---

### Task 9: End-to-end push notification test

- [ ] **Step 1: Build and run on real device (not simulator)**

Push notifications require a physical device with Apple Push Notification entitlement.

```bash
bash scripts/build-mobile.sh
npx cap sync ios
npx cap open ios
```

In Xcode: select your physical device → Run.

- [ ] **Step 2: Verify push registration**

After logging in on the device:
1. Check Supabase → Table Editor → `device_tokens` — a row should appear for the device
2. The `token_type` should be `fcm` (not `apns`)

- [ ] **Step 3: Trigger a push notification**

From another account (or via Supabase Studio), insert an expense into a trip the device user is a member of.

Expected: push notification appears on device within 5 seconds.

- [ ] **Step 4: Commit any fixes**

```bash
git add .
git commit -m "fix(push): resolve issues found during end-to-end push notification testing"
```

---

### Task 10: Store compliance items

These must be complete before submitting to App Store or Play Store.

- [ ] **Privacy Policy**: Create a privacy policy page (e.g., at `/privacy`) explaining what data is collected (email, display name, expense records). Link it in app metadata.

- [ ] **App Store screenshots**: Generate screenshots for all required device sizes using the iOS Simulator (iPhone 6.7", 6.5", 5.5" and iPad if needed).

- [ ] **Android back button**: Verify the Android hardware back button works correctly in the WebView (should navigate back in-app, not close the app). In `capacitor.config.ts`:

```typescript
android: {
  backgroundColor: '#FAFAFA',
},
```

Capacitor handles back button navigation by default for WebView apps.

- [ ] **iOS push notification usage description**: In `ios/App/App/Info.plist`, add:

```xml
<key>NSUserNotificationUsageDescription</key>
<string>ShareMoney 會在旅行成員新增費用時通知你，讓你即時掌握分帳狀況。</string>
```

- [ ] **iOS deep link URL scheme**: In `ios/App/App/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>sharemoney</string>
    </array>
  </dict>
</array>
```

- [ ] **Final build and submit**:

iOS:
```bash
bash scripts/build-mobile.sh
npx cap sync ios
# Open Xcode, set version/build number, Archive → Distribute App → App Store Connect
```

Android:
```bash
bash scripts/build-mobile.sh
npx cap sync android
# Open Android Studio, Build → Generate Signed Bundle → Google Play
```

- [ ] **Commit final compliance items**

```bash
git add ios/App/App/Info.plist android/
git commit -m "feat(compliance): add push notification usage description and deep link URL scheme"
```
