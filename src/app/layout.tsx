import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Inter } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ShareMoney',
  description: '分帳工具——旅遊、聚餐、社團、公司活動都好用',
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

/** ca-pub-... — unset in dev/preview, so no AdSense script is loaded there. */
const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className={`${inter.className} bg-surface text-ink min-h-screen`}>
        <NextTopLoader color="#4f61c9" height={2} showSpinner={false} shadow={false} />
        <ServiceWorkerRegistration />
        {children}
        {adsenseClient && (
          // beforeInteractive = injected into the server HTML <head>; afterInteractive is
          // client-side only, which the AdSense verification crawler cannot see.
          <Script
            async
            strategy="beforeInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          />
        )}
      </body>
    </html>
  )
}
