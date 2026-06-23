import Link from 'next/link'
import { getPendingReviews } from '@/lib/reviews'
import { ReviewList } from '@/components/review/ReviewList'

export default async function ReviewPage() {
  const reviews = await getPendingReviews()

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-5">
        <Link
          href="/trips"
          aria-label="返回行程"
          className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">待我審核</h1>
        {reviews.length > 0 && (
          <span className="text-xs text-ink-4 ml-auto">{reviews.length} 筆</span>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-center text-sm text-ink-4 py-16">沒有待審核的費用</p>
      ) : (
        <ReviewList reviews={reviews} />
      )}
    </main>
  )
}
