import { joinTripAction } from '@/lib/actions/members'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
  }

  async function join() {
    'use server'
    await joinTripAction(token)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-sm text-center flex flex-col gap-4">
        <div className="text-4xl">✈️</div>
        <h1 className="text-xl font-bold">加入行程</h1>
        <p className="text-sm text-gray-500">點下方按鈕加入此行程</p>
        <form action={join}>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition"
          >
            確認加入
          </button>
        </form>
      </div>
    </main>
  )
}
