'use client'

import { useState, useTransition } from 'react'
import { upsertPaymentAccountAction, deletePaymentAccountAction } from '@/lib/actions/profile'
import { BANKS } from '@/lib/utils/banks'
import { ACCOUNT_HOLDER_MAX_LENGTH } from '@/lib/utils/payment-account'

type Props = {
  initial: { bank_code: string; account_number: string; account_holder: string | null } | null
}

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

export function PaymentAccountForm({ initial }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleted, setDeleted] = useState(false)

  function handleSubmit(formData: FormData) {
    setError(null)
    setSaved(false)
    setDeleted(false)
    startTransition(async () => {
      const result = await upsertPaymentAccountAction(formData)
      if (result?.error) { setError(result.error); return }
      setSaved(true)
    })
  }

  function handleDelete() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await deletePaymentAccountAction()
      if (result?.error) { setError(result.error); return }
      setDeleted(true)
    })
  }

  if (deleted) {
    return <p className="text-sm text-ink-3">已刪除收款帳戶</p>
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2.5">
        <div className="w-[45%]">
          <label htmlFor="bank_code" className="block text-xs font-medium text-ink-3 mb-1.5">銀行</label>
          <select
            id="bank_code"
            name="bank_code"
            required
            defaultValue={initial?.bank_code ?? ''}
            className={inputClass}
          >
            <option value="" disabled>選擇銀行</option>
            {BANKS.map(b => (
              <option key={b.code} value={b.code}>{b.code} {b.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="account_number" className="block text-xs font-medium text-ink-3 mb-1.5">帳號</label>
          <input
            id="account_number"
            name="account_number"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            minLength={6}
            maxLength={19}
            pattern="[0-9\s-]{6,19}"
            defaultValue={initial?.account_number ?? ''}
            placeholder="6–16 位數字"
            className={`${inputClass} font-mono tabular-nums`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="account_holder" className="block text-xs font-medium text-ink-3 mb-1.5">戶名（選填）</label>
        <input
          id="account_holder"
          name="account_holder"
          type="text"
          maxLength={ACCOUNT_HOLDER_MAX_LENGTH}
          defaultValue={initial?.account_holder ?? ''}
          placeholder="與銀行帳戶相同的姓名，方便對方確認"
          className={inputClass}
        />
      </div>

      <p className="text-xs text-ink-4">與你同行程的成員在結算時可以看到這個帳戶，方便轉帳給你。</p>

      {error && <p className="text-sm text-owe">{error}</p>}
      {saved && <p className="text-sm text-gain">已更新</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent text-white text-sm font-semibold px-4 py-2 rounded-[10px] hover:bg-accent-deep transition-colors disabled:opacity-50"
        >
          {isPending ? '儲存中…' : '儲存'}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-owe hover:underline disabled:opacity-50"
          >
            刪除帳戶
          </button>
        )}
      </div>
    </form>
  )
}
