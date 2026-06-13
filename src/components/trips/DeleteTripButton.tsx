'use client'

type DeleteTripButtonProps = {
  action: (formData: FormData) => void | Promise<void>
  label?: string
  iconOnly?: boolean
}

export function DeleteTripButton({ action, label = '刪除', iconOnly }: DeleteTripButtonProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm('確定要刪除這個行程嗎？所有費用與分帳資料都會一併刪除。')) {
          event.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className={
          iconOnly
            ? 'p-1.5 rounded-lg text-ink-4/70 hover:text-owe hover:bg-owe/5 transition-colors'
            : 'text-sm font-medium text-owe hover:opacity-80 transition-opacity'
        }
        aria-label={iconOnly ? label : undefined}
      >
        {iconOnly ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        ) : label}
      </button>
    </form>
  )
}
