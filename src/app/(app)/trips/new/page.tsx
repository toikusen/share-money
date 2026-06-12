import { createTripAction, fetchExchangeRate } from '@/lib/actions/trips'
import Link from 'next/link'

export default async function NewTripPage() {
  const rate = await fetchExchangeRate()

  async function handleCreate(formData: FormData) {
    'use server'
    await createTripAction(formData)
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold">新增行程</h1>
      </div>

      <form action={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">行程名稱</label>
          <input
            name="name"
            type="text"
            required
            placeholder="東京五日遊"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">日期區間<span className="text-gray-400 font-normal ml-1">（選填）</span></label>
          <div className="flex items-center gap-2">
            <input
              name="start_date"
              type="date"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <span className="text-gray-400 text-sm shrink-0">–</span>
            <input
              name="end_date"
              type="date"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            匯率（1 JPY = ? TWD）
          </label>
          <input
            name="exchange_rate"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            defaultValue={rate ?? ''}
            placeholder={rate ? String(rate) : '請手動輸入（目前無法取得即時匯率）'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {rate ? (
            <p className="text-xs text-gray-400 mt-1">已自動填入即時匯率，可手動修改</p>
          ) : (
            <p className="text-xs text-red-400 mt-1">無法取得即時匯率，請手動輸入</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          建立行程
        </button>
      </form>
    </main>
  )
}
