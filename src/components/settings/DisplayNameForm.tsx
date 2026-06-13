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
        <label htmlFor="display_name" className="sr-only">顯示名稱</label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          defaultValue={initialName}
          className="w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
        />
        <p className="text-xs text-ink-4 mt-1.5">其他成員會在行程與分帳中看到這個名稱</p>
      </div>

      {error && <p className="text-sm text-owe">{error}</p>}
      {saved && <p className="text-sm text-gain">已更新</p>}

      <button
        type="submit"
        disabled={isPending}
        className="self-start bg-accent text-white text-sm font-semibold px-4 py-2 rounded-[10px] hover:bg-accent-deep transition-colors disabled:opacity-50"
      >
        {isPending ? '儲存中…' : '儲存'}
      </button>
    </form>
  )
}
