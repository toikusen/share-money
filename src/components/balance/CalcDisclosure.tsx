'use client'

import { useState } from 'react'

/**
 * 「計算過程」摺疊卡:對帳的人才需要展開,
 * 其他人停在「建議轉帳」就拿到答案了。
 */
export function CalcDisclosure({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center justify-between bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow px-4 py-3 text-left"
      >
        <span className="text-[13px] font-medium text-ink-2">計算過程 — 每人墊付與應攤</span>
        <svg
          width="14" height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {open && (
        <div className="bg-white rounded-2xl shadow-card p-4 anim-rise">
          {children}
        </div>
      )}
    </div>
  )
}
