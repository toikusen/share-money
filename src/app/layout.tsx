import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import { CANONICAL_SITE_URL } from '@/lib/site-url'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  // Lets each page declare `alternates.canonical` as a path instead of a full URL.
  metadataBase: new URL(CANONICAL_SITE_URL),
  title: 'ShareMoney',
  description: '分帳工具——旅遊、聚餐、社團、公司活動都好用',
  openGraph: {
    siteName: 'ShareMoney',
    locale: 'zh_TW',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ShareMoney',
  },
}

export const viewport: Viewport = {
  // ≈ oklch(0.52 0.11 255)
  themeColor: '#4f61c9',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className={`${inter.className} bg-surface text-ink min-h-screen`}>
        <NextTopLoader color="#4f61c9" height={2} showSpinner={false} shadow={false} />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  )
}
