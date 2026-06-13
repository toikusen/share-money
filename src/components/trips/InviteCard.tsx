'use client'

import { useRef, useState } from 'react'

type CopyState = 'idle' | 'copied' | 'error'

/** 邀請成員:虛線膠囊按鈕,點了直接複製邀請連結 */
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

  return (
    <button
      onClick={handleCopy}
      className={`shrink-0 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition-colors ${
        state === 'copied'
          ? 'border-gain/40 text-gain'
          : state === 'error'
            ? 'border-owe/40 text-owe'
            : 'border-edge text-ink-2 hover:border-ink-4 hover:text-ink'
      }`}
    >
      {state === 'copied' ? '✓ 已複製邀請連結' : state === 'error' ? '複製失敗' : '＋ 邀請成員'}
    </button>
  )
}
