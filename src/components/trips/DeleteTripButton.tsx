'use client'

type DeleteTripButtonProps = {
  action: (formData: FormData) => void | Promise<void>
  label?: string
}

export function DeleteTripButton({ action, label = '刪除' }: DeleteTripButtonProps) {
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
        className="text-sm font-medium text-red-500 hover:text-red-700 transition"
      >
        {label}
      </button>
    </form>
  )
}
