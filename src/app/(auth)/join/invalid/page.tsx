import Link from 'next/link'

export default function InvalidTokenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">❌</div>
        <h1 className="text-xl font-bold mb-2">連結無效</h1>
        <p className="text-sm text-gray-500 mb-6">此邀請連結不存在，請向行程建立者重新索取。</p>
        <Link href="/trips" className="text-indigo-600 text-sm font-medium hover:underline">
          返回我的行程
        </Link>
      </div>
    </main>
  )
}
