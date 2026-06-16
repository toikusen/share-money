# Mobile App — Plan 2: Capacitor Build + Mobile OAuth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plan 1 (Data Layer Foundation) must be complete. All pages are Client Components. `@supabase/ssr` is removed.

**Goal:** Create a working Capacitor iOS + Android app from the existing codebase using an SPA build mode, with correct Google OAuth flow via system browser.

**Architecture:** A separate `src/app-mobile/` directory holds the SPA shell (`[[...slug]]`). A build script swaps `src/app/` ↔ `src/app-mobile/` before running `next build` with `output: 'export'`. Capacitor wraps the static output. Google OAuth uses `@capacitor/browser` to open the system browser, then handles the deep link callback via `@capacitor/app`.

**Tech Stack:** Capacitor 7.x, @capacitor/browser, @capacitor/app, Next.js static export, Xcode 26+ (iOS), Android Studio

---

## File Map

| File | Action |
|------|--------|
| `src/app-mobile/[[...slug]]/page.tsx` | Create — SPA catch-all shell |
| `src/app-mobile/layout.tsx` | Create — mobile root layout |
| `src/components/mobile/MobileRouter.tsx` | Create — path → component mapper |
| `src/components/mobile/MobileAuthGuard.tsx` | Create — client-side auth check |
| `src/app/(auth)/login/page.tsx` | Modify — add mobile OAuth branch |
| `scripts/build-mobile.sh` | Create — swap app dirs + next build |
| `next.config.ts` | Modify — add `output: 'export'` when MOBILE |
| `capacitor.config.ts` | Create — Capacitor configuration |
| `package.json` | Modify — add Capacitor dependencies |

---

### Task 1: Install Capacitor dependencies

- [ ] **Step 1: Install packages**

```bash
npm install @capacitor/core@7 @capacitor/app@7 @capacitor/browser@7 @capacitor/push-notifications@7
npm install --save-dev @capacitor/cli@7 @capacitor/ios@7 @capacitor/android@7
```

- [ ] **Step 2: Verify install**

```bash
npx cap --version
```

Expected: `7.x.x`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Capacitor 7.x dependencies"
```

---

### Task 2: Create Capacitor config

**Files:**
- Create: `capacitor.config.ts`

- [ ] **Step 1: Create config file**

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'tw.neutec.sharemoney',
  appName: 'ShareMoney',
  webDir: 'out',
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
```

> **Note:** `appId` must be unique in App Store / Play Store. Use your actual developer team's domain in reverse notation.

- [ ] **Step 2: Commit**

```bash
git add capacitor.config.ts
git commit -m "chore: add Capacitor config"
```

---

### Task 3: Update next.config.ts for mobile static export

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Read current next.config.ts**

```bash
cat next.config.ts
```

- [ ] **Step 2: Add mobile output mode**

Add `output: 'export'` and `images.unoptimized: true` when `NEXT_PUBLIC_PLATFORM=mobile`. Static export does not support Next.js Image Optimization.

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const isMobile = process.env.NEXT_PUBLIC_PLATFORM === 'mobile'

const nextConfig: NextConfig = {
  ...(isMobile && {
    output: 'export',
    images: { unoptimized: true },
  }),
}

export default nextConfig
```

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "chore(next): add static export mode for mobile build"
```

---

### Task 4: Create mobile SPA app directory

**Files:**
- Create: `src/app-mobile/layout.tsx`
- Create: `src/app-mobile/[[...slug]]/page.tsx`

The mobile build uses `src/app-mobile/` instead of `src/app/`. The `[[...slug]]` catch-all generates a single `index.html` shell that handles all routing client-side.

- [ ] **Step 1: Create mobile root layout**

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
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Create SPA catch-all shell**

```tsx
// src/app-mobile/[[...slug]]/page.tsx
'use client'

export function generateStaticParams() {
  return [{ slug: [''] }]
}

export default function MobileShell() {
  return <MobileApp />
}

// Inline to avoid import issues during static generation
function MobileApp() {
  // Dynamically import to avoid SSR issues
  if (typeof window === 'undefined') return null
  const { MobileRouter } = require('@/components/mobile/MobileRouter')
  return <MobileRouter />
}
```

> **Note:** The `require()` pattern avoids Next.js static generation trying to run browser-only code. Alternatively use `dynamic(() => import(...), { ssr: false })`.

Cleaner version using `dynamic`:

```tsx
// src/app-mobile/[[...slug]]/page.tsx
'use client'

import dynamic from 'next/dynamic'

const MobileRouter = dynamic(
  () => import('@/components/mobile/MobileRouter').then(m => m.MobileRouter),
  { ssr: false }
)

export function generateStaticParams() {
  return [{ slug: [''] }]
}

export default function MobileShell() {
  return <MobileRouter />
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app-mobile/
git commit -m "feat(mobile): add mobile SPA app directory with catch-all shell"
```

---

### Task 5: Create MobileRouter component

**Files:**
- Create: `src/components/mobile/MobileRouter.tsx`
- Create: `src/components/mobile/MobileAuthGuard.tsx`

`MobileRouter` reads `pathname` and renders the appropriate page component. `MobileAuthGuard` protects private routes.

- [ ] **Step 1: Create MobileAuthGuard**

```tsx
// src/components/mobile/MobileAuthGuard.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function MobileAuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const router = useRouter()

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
      else setChecked(true)
    })
  }, [router])

  if (!checked) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <p className="text-sm text-ink-4">載入中…</p>
    </div>
  )
  return <>{children}</>
}
```

- [ ] **Step 2: Create MobileRouter**

The router parses `usePathname()` and renders the correct page component. Segments like `/trips/abc123` are parsed by splitting the path.

```tsx
// src/components/mobile/MobileRouter.tsx
'use client'

import { usePathname } from 'next/navigation'
import { MobileAuthGuard } from './MobileAuthGuard'

// Lazy imports for each page to keep bundle lean
import dynamic from 'next/dynamic'

const TripsPage = dynamic(() => import('@/app/(app)/trips/page'))
const TripDetailPage = dynamic(() => import('@/app/(app)/trips/[id]/page'))
const TripBalancePage = dynamic(() => import('@/app/(app)/trips/[id]/balance/page'))
const TripActivityPage = dynamic(() => import('@/app/(app)/trips/[id]/activity/page'))
const NewTripPage = dynamic(() => import('@/app/(app)/trips/new/page'))
const SettingsPage = dynamic(() => import('@/app/(app)/settings/page'))
const LoginPage = dynamic(() => import('@/app/(auth)/login/page'))
const JoinPage = dynamic(() => import('@/app/(auth)/join/[token]/page'))
const JoinInvalidPage = dynamic(() => import('@/app/(auth)/join/invalid/page'))
const AuthCallbackPage = dynamic(() => import('@/app/(auth)/auth/callback/page'))

const PUBLIC_PATHS = ['/login', '/auth/callback', '/join']

export function MobileRouter() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  function renderPage() {
    // /login
    if (pathname === '/login') return <LoginPage />
    // /auth/callback
    if (pathname === '/auth/callback') return <AuthCallbackPage />
    // /join/invalid
    if (pathname === '/join/invalid') return <JoinInvalidPage />
    // /join/:token
    if (segments[0] === 'join' && segments[1]) return <JoinPage />
    // /trips/new
    if (pathname === '/trips/new') return <NewTripPage />
    // /trips/:id/balance
    if (segments[0] === 'trips' && segments[1] && segments[2] === 'balance') return <TripBalancePage />
    // /trips/:id/activity
    if (segments[0] === 'trips' && segments[1] && segments[2] === 'activity') return <TripActivityPage />
    // /trips/:id
    if (segments[0] === 'trips' && segments[1]) return <TripDetailPage />
    // /trips
    if (pathname === '/trips' || pathname === '/') return <TripsPage />
    // /settings
    if (pathname === '/settings') return <SettingsPage />
    // 404 fallback
    return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-4">頁面不存在</p></div>
  }

  if (isPublic) return renderPage()
  return <MobileAuthGuard>{renderPage()}</MobileAuthGuard>
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/mobile/
git commit -m "feat(mobile): add MobileRouter and MobileAuthGuard components"
```

---

### Task 6: Create mobile build script

**Files:**
- Create: `scripts/build-mobile.sh`

- [ ] **Step 1: Create build script**

```bash
#!/bin/bash
# scripts/build-mobile.sh
# Swaps src/app <-> src/app-mobile, runs next build with static export, restores.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")/src"

APP_DIR="$PROJECT_DIR/app"
MOBILE_DIR="$PROJECT_DIR/app-mobile"
BACKUP_DIR="$PROJECT_DIR/app-web-backup"

cleanup() {
  echo "Restoring original app directory..."
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$APP_DIR"
    mv "$BACKUP_DIR" "$APP_DIR"
  fi
}

trap cleanup EXIT

echo "Swapping app directory for mobile build..."
mv "$APP_DIR" "$BACKUP_DIR"
cp -r "$MOBILE_DIR" "$APP_DIR"

echo "Running next build (static export)..."
NEXT_PUBLIC_PLATFORM=mobile npx next build

echo "Build complete. Output in ./out/"
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x scripts/build-mobile.sh
git add scripts/build-mobile.sh
git commit -m "feat(mobile): add build-mobile.sh script for static export build"
```

- [ ] **Step 3: Test the build script**

```bash
bash scripts/build-mobile.sh
```

Expected: build succeeds, `out/` directory created with `index.html`. No TypeScript errors.

If build fails, common fixes:
- Any remaining `import { createClient } from '@/lib/supabase/server'` → change to browser client
- Any `cookies()` usage → remove (should be gone after Plan 1)
- Any Route Handler → ensure `route.ts` files don't exist in the swapped app directory

---

### Task 7: Initialize Capacitor platforms

- [ ] **Step 1: Init Capacitor (run from project root)**

```bash
npx cap init ShareMoney tw.neutec.sharemoney --web-dir out
```

- [ ] **Step 2: Add platforms**

```bash
npx cap add ios
npx cap add android
```

- [ ] **Step 3: Sync after a fresh build**

```bash
bash scripts/build-mobile.sh
npx cap sync
```

- [ ] **Step 4: Commit the Capacitor platform files**

```bash
git add ios/ android/ .gitignore
git commit -m "feat(mobile): add Capacitor iOS and Android platforms"
```

> Add `*.xcworkspace/xcuserdata/`, `android/.gradle/`, `android/local.properties` to `.gitignore` if not already present.

---

### Task 8: Configure mobile Google OAuth (system browser)

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

Google rejects OAuth inside a WebView (`disallowed_useragent` error). Mobile must open the system browser, then handle the deep link callback.

- [ ] **Step 1: Update login page for mobile OAuth**

```tsx
// src/app/(auth)/login/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const IS_MOBILE = process.env.NEXT_PUBLIC_PLATFORM === 'mobile'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(searchParams.get('next') ?? '/trips')
    })

    if (IS_MOBILE) {
      // Listen for deep link return from system browser OAuth
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appUrlOpen', async ({ url }) => {
          const parsedUrl = new URL(url)
          const code = parsedUrl.searchParams.get('code')
          if (code) {
            const next = parsedUrl.searchParams.get('next') ?? '/trips'
            const { error } = await createClient().auth.exchangeCodeForSession(code)
            if (!error) router.replace(next)
          }
        })
      })
    }
  }, [router, searchParams])

  async function signIn() {
    const next = searchParams.get('next') ?? '/trips'

    if (IS_MOBILE) {
      const callbackUrl = 'sharemoney://auth/callback'
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,  // <-- CRITICAL: prevents Supabase from opening WebView
        },
      })
      if (error || !data.url) { console.error('OAuth error', error); return }

      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: data.url })
      // Supabase redirects to sharemoney://auth/callback?code=xxx
      // appUrlOpen listener above handles the code exchange
    } else {
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('next', next)
      await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      })
    }
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

- [ ] **Step 2: Configure deep link scheme in Capacitor**

In `capacitor.config.ts`, ensure the app ID matches your deep link scheme. Then:

**iOS** — in Xcode, go to Project → Targets → Info → URL Types, add:
- URL Schemes: `sharemoney`

**Android** — add to `android/app/src/main/AndroidManifest.xml` inside the main `<activity>`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="sharemoney" android:host="auth" />
</intent-filter>
```

- [ ] **Step 3: Register redirect URL in Supabase dashboard**

In Supabase → Authentication → URL Configuration → Redirect URLs, add:
```
sharemoney://auth/callback
```

- [ ] **Step 4: Commit login page changes**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat(mobile): add system browser OAuth flow with deep link callback"
```

---

### Task 9: Run on simulator / device

- [ ] **Step 1: Build and sync**

```bash
bash scripts/build-mobile.sh
npx cap sync
```

- [ ] **Step 2: Open iOS (requires Mac + Xcode 26+)**

```bash
npx cap open ios
```

In Xcode: select a simulator or device → click Run (▶).

Expected:
- App opens showing login screen
- Tapping Google login opens system Safari
- After Google auth, Safari redirects to `sharemoney://auth/callback`
- App re-opens and navigates to `/trips`

- [ ] **Step 3: Open Android**

```bash
npx cap open android
```

In Android Studio: select emulator or device → click Run.

- [ ] **Step 4: Commit any fixes found during testing**

```bash
git add .
git commit -m "fix(mobile): resolve issues found during simulator testing"
```
