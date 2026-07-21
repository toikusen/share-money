import { NextResponse, type NextRequest } from 'next/server'

/**
 * Fast, optimistic auth check. Next.js 16 normally calls this convention
 * `proxy`, but Proxy is Node-only while the OpenNext Cloudflare adapter
 * currently supports Edge Middleware. Keep this edge-compatible implementation
 * until the adapter supports Node Proxy.
 *
 * This checks only for Supabase's session cookie and never calls Auth or
 * Postgres; the app layout and RLS remain the secure checks.
 */
export function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : ''
  const cookieBase = projectRef ? `sb-${projectRef}-auth-token` : ''
  const hasSessionCookie = cookieBase !== '' && request.cookies.getAll().some(({ name }) => (
    name === cookieBase || name.startsWith(`${cookieBase}.`)
  ))

  if (hasSessionCookie) return NextResponse.next()

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/', '/trips/:path*', '/review/:path*', '/settings/:path*'],
}
