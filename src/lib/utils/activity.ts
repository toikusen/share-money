import { formatAmount } from '@/lib/utils/currency'
import { formatExpenseDateTime } from '@/lib/utils/datetime'
import type { ActivityEvent, ExpenseDiff } from '@/types/database'

/**
 * Renders an activity log event as a display sentence,
 * e.g. 「小華 編輯了『晚餐』：金額從 ¥1,200 改為 ¥1,500」.
 */
export function formatActivityText(
  event: ActivityEvent,
  actorName: string,
  nameOf: (userId: string) => string,
): string {
  switch (event.action) {
    case 'trip.created':
      return `${actorName} 建立了行程`
    case 'member.joined':
      return `${actorName} 加入了行程`
    case 'trip.rate_updated':
      return `${actorName} 將匯率從 ${event.details.old_rate} 改為 ${event.details.new_rate}`
    case 'expense.created':
      return `${actorName} 新增了『${event.details.title}』 ${formatAmount(event.details.amount, event.details.currency)}`
    case 'expense.deleted':
      return `${actorName} 刪除了『${event.details.title}』 ${formatAmount(event.details.amount, event.details.currency)}`
    case 'expense.approved':
      return `${actorName} 確認了『${event.details.title}』 ${formatAmount(event.details.amount, event.details.currency)}`
    case 'expense.rejected':
      return `${actorName} 拒絕了『${event.details.title}』 ${formatAmount(event.details.amount, event.details.currency)}`
    case 'expense.updated':
      return `${actorName} 編輯了『${event.details.title}』：${expenseChanges(event.details.old, event.details.new, nameOf).join('、')}`
    case 'settlement.created':
      return `${actorName} 記錄了還款 ${formatAmount(event.details.amount, event.details.currency)} 給 ${nameOf(event.details.to_user)}`
    case 'settlement.confirmed':
      return `${actorName} 確認了 ${nameOf(event.details.from_user)} 的還款 ${formatAmount(event.details.amount, event.details.currency)}`
    case 'settlement.rejected':
      return `${actorName} 拒絕了 ${nameOf(event.details.from_user)} 的還款 ${formatAmount(event.details.amount, event.details.currency)}`
    case 'settlement.deleted':
      return `${actorName} 刪除了給 ${nameOf(event.details.to_user)} 的還款 ${formatAmount(event.details.amount, event.details.currency)}`
  }
}

function expenseChanges(
  prev: ExpenseDiff,
  next: ExpenseDiff,
  nameOf: (userId: string) => string,
): string[] {
  const parts: string[] = []
  // The SQL writer guarantees prev and next carry the same keys,
  // and amount always travels with currency.
  if (prev.title !== undefined)
    parts.push(`名稱從『${prev.title}』改為『${next.title}』`)
  if (prev.amount !== undefined)
    parts.push(`金額從 ${formatAmount(prev.amount, prev.currency!)} 改為 ${formatAmount(next.amount!, next.currency!)}`)
  if (prev.paid_by !== undefined)
    parts.push(`付款人從 ${nameOf(prev.paid_by)} 改為 ${nameOf(next.paid_by!)}`)
  if (prev.paid_at !== undefined)
    parts.push(`付款時間從 ${formatExpenseDateTime(prev.paid_at)} 改為 ${formatExpenseDateTime(next.paid_at!)}`)
  if (prev.note !== undefined)
    parts.push(next.note ? '更新了備註' : '移除了備註')
  if (prev.splits !== undefined)
    parts.push('調整了分擔方式')
  return parts
}
