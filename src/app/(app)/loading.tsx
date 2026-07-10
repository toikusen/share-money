/**
 * Shared instant-loading skeleton for all (app) routes. Its presence also lets
 * Next.js partially prefetch these dynamic routes, so client transitions paint
 * immediately instead of freezing until the server responds.
 */
export default function Loading() {
  return (
    <main className="max-w-lg mx-auto px-5 py-7" aria-busy="true" aria-label="載入中">
      <div className="animate-pulse">
        <div className="h-7 w-36 rounded-lg bg-fill mb-8" />
        <div className="flex flex-col gap-2.5">
          <div className="h-20 rounded-2xl bg-fill" />
          <div className="h-20 rounded-2xl bg-fill" />
          <div className="h-20 rounded-2xl bg-fill opacity-70" />
          <div className="h-20 rounded-2xl bg-fill opacity-40" />
        </div>
      </div>
    </main>
  )
}
