'use client'

import { useRef, useState } from 'react'

type CopyState = 'idle' | 'copied' | 'error'

export function InviteCard({ inviteUrl }: { inviteUrl: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl)
      .then(() => setState('copied'))
      .catch(() => setState('error'))
      .finally(() => {
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => setState('idle'), 2000)
      })
  }

  const displayUrl = inviteUrl.replace(/^https?:\/\//, '')

  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2 dark:border-gray-700">
      <span className="text-xs text-gray-500 dark:text-gray-400">邀請連結</span>
      <button
        onClick={handleCopy}
        className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          state === 'copied'
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
            : state === 'error'
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
              : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300'
        }`}
      >
        {state === 'copied' ? '✓ 已複製' : state === 'error' ? '複製失敗' : '複製連結'}
      </button>
    </div>
  )
}
