'use client'

import { useState, useTransition } from 'react'
import { updateDisplayNameAction } from '@/lib/actions/profile'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/utils/profile'

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateDisplayNameAction(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          顯示名稱
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          defaultValue={initialName}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <p className="text-xs text-gray-400 mt-1">其他成員會在行程與分帳中看到這個名稱</p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved && <p className="text-sm text-green-600">已更新</p>}

      <button
        type="submit"
        disabled={isPending}
        className="self-start bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {isPending ? '儲存中…' : '儲存'}
      </button>
    </form>
  )
}
