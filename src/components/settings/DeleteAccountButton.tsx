'use client'

import { deleteAccountAction } from '@/lib/actions/profile'
import { disablePush } from '@/lib/push-client'
import { useState, useTransition } from 'react'

export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full flex items-center justify-center rounded-[10px] bg-fill px-4 py-2 text-sm font-medium text-owe transition-colors hover:bg-owe/10"
      >
        刪除帳號
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-3 leading-relaxed">
        帳號與登入資訊將永久刪除，無法復原。你在各帳本中的費用紀錄會保留給其他成員結算，名稱顯示為「已刪除使用者」。
      </p>
      {error && <p className="text-xs text-owe">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-[10px] bg-fill px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-fill/70 disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            await disablePush().catch(() => {})
            const result = await deleteAccountAction()
            if (result?.error) setError(result.error)
          })}
          className="flex-1 rounded-[10px] bg-owe px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-owe/90 disabled:opacity-50"
        >
          {isPending ? '刪除中…' : '確認永久刪除'}
        </button>
      </div>
    </div>
  )
}
