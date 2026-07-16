import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className={`${inter.className} bg-surface text-ink min-h-screen`}>
        <NextTopLoader color="#4f61c9" height={2} showSpinner={false} shadow={false} />
        {children}
      </body>
    </html>
  )
}
