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
    <div className="mt-3 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/70 p-3.5 dark:border-indigo-500/40 dark:bg-indigo-500/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
            ✦ 邀請夥伴一起分帳
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-indigo-400 dark:text-indigo-300/70 truncate">
            {displayUrl}
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition ${
            state === 'copied'
              ? 'bg-emerald-500 anim-pop'
              : state === 'error'
                ? 'bg-rose-500 anim-pop'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
          }`}
        >
          {state === 'copied' ? '✓ 已複製' : state === 'error' ? '複製失敗' : '複製連結'}
        </button>
      </div>
    </div>
  )
}
