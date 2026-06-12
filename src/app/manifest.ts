import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ShareMoney',
    short_name: 'ShareMoney',
    description: '旅遊分帳工具',
    start_url: '/',
    display: 'standalone',
    background_color: '#F9FAFB',
    theme_color: '#4F46E5',
    lang: 'zh-TW',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
