import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/JsonLd'
import { ARTICLES, findArticle, relatedArticles } from '@/content/articles'
import { SITE_AUTHOR, SITE_NAME } from '@/lib/site'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

type Params = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return ARTICLES.map(a => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const article = findArticle(slug)
  if (!article) return {}

  return {
    title: `${article.title} | ShareMoney 分帳`,
    description: article.description,
    alternates: { canonical: `/articles/${slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.description,
      publishedTime: article.published,
      modifiedTime: article.updated ?? article.published,
    },
  }
}

const formatDate = (iso: string) => iso.replaceAll('-', '/')

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params
  const article = findArticle(slug)
  if (!article) notFound()

  const url = `${CANONICAL_SITE_URL}/articles/${slug}`
  const related = relatedArticles(slug)

  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: article.title,
          description: article.description,
          datePublished: article.published,
          dateModified: article.updated ?? article.published,
          inLanguage: 'zh-TW',
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          author: { '@type': 'Person', name: SITE_AUTHOR.name, url: `${CANONICAL_SITE_URL}/about` },
          publisher: { '@type': 'Organization', name: SITE_NAME, url: CANONICAL_SITE_URL },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: '首頁', item: CANONICAL_SITE_URL },
            { '@type': 'ListItem', position: 2, name: '分帳文章', item: `${CANONICAL_SITE_URL}/articles` },
            { '@type': 'ListItem', position: 3, name: article.title, item: url },
          ],
        }}
      />

      <nav aria-label="麵包屑" className="text-xs text-ink-4 mb-5 flex items-center gap-1.5">
        <Link href="/" className="hover:text-ink">首頁</Link>
        <span>/</span>
        <Link href="/articles" className="hover:text-ink">分帳文章</Link>
      </nav>

      <article>
        <header className="mb-7">
          <div className="flex items-center gap-2 text-xs text-ink-4 mb-2.5">
            <span className="rounded-full bg-fill px-2 py-0.5 text-ink-3">{article.category}</span>
            <time dateTime={article.published}>{formatDate(article.published)}</time>
          </div>
          <h1 className="text-[22px] leading-snug font-bold tracking-tight text-ink">{article.title}</h1>
          <p className="text-xs text-ink-4 mt-3">
            文｜
            <Link href="/about" className="hover:text-ink-2">{SITE_AUTHOR.name}</Link>
            <span className="mx-1.5">·</span>
            {SITE_AUTHOR.role}
          </p>
        </header>

        <div className="article-body">{article.body}</div>
      </article>

      {related.length > 0 && (
        <section className="border-t border-line pt-7 mt-10">
          <h2 className="text-base font-bold text-ink mb-4">延伸閱讀</h2>
          <div className="flex flex-col gap-3">
            {related.map(a => (
              <Link
                key={a.slug}
                href={`/articles/${a.slug}`}
                className="block bg-white rounded-2xl shadow-card p-4 hover:shadow-card-hover transition-shadow"
              >
                <h3 className="text-sm font-bold text-ink leading-snug mb-1">{a.title}</h3>
                <p className="text-[13px] text-ink-3 leading-relaxed">{a.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        要自己算一筆，用<Link href="/calculator" className="text-accent hover:underline mx-1">分帳計算機</Link>；
        要開一本記到底，<Link href="/login" className="text-accent hover:underline mx-1">登入開帳本</Link>。
      </div>
    </main>
  )
}
