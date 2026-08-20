import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { ARTICLES } from '@/content/articles'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  title: '分帳文章｜旅遊、合租、聚餐的算錢實務 | ShareMoney',
  description:
    '團體旅行的外幣分帳、室友水電怎麼分、代墊報帳、尾數與四捨五入——把一群人一起花錢時真正會遇到的算錢問題寫清楚。',
  alternates: { canonical: '/articles' },
}

const formatDate = (iso: string) => iso.replaceAll('-', '/')

export default function ArticlesPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'ShareMoney 分帳文章',
          url: `${CANONICAL_SITE_URL}/articles`,
          inLanguage: 'zh-TW',
          blogPost: ARTICLES.map(a => ({
            '@type': 'BlogPosting',
            headline: a.title,
            description: a.description,
            datePublished: a.published,
            dateModified: a.updated ?? a.published,
            url: `${CANONICAL_SITE_URL}/articles/${a.slug}`,
          })),
        }}
      />

      <h1 className="text-xl font-bold text-ink mb-2">分帳文章</h1>
      <p className="text-sm text-ink-3 leading-relaxed mb-8">
        一群人一起花錢，難的不是加減乘除，是那些每次都會遇到、但沒人講清楚的細節：
        海外刷卡的匯率跟帳單為什麼差 2%、有人那餐沒去要怎麼算、室友的水電按人分還是按房間分、
        代墊了三個月的錢該怎麼一次要回來。這裡是這些問題的答案。
      </p>

      <div className="flex flex-col gap-3">
        {ARTICLES.map(a => (
          <Link
            key={a.slug}
            href={`/articles/${a.slug}`}
            className="block bg-white rounded-2xl shadow-card p-5 hover:shadow-card-hover transition-shadow"
          >
            <div className="flex items-center gap-2 text-xs text-ink-4 mb-1.5">
              <span className="rounded-full bg-fill px-2 py-0.5 text-ink-3">{a.category}</span>
              <time dateTime={a.published}>{formatDate(a.published)}</time>
            </div>
            <h2 className="text-[15px] font-bold text-ink leading-snug mb-1.5">{a.title}</h2>
            <p className="text-sm text-ink-2 leading-relaxed">{a.description}</p>
          </Link>
        ))}
      </div>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        想直接算一筆帳，用<Link href="/calculator" className="text-accent hover:underline mx-1">分帳計算機</Link>；
        想知道結算的推導，看<Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>。
      </div>
    </main>
  )
}
