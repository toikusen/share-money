const DEFAULT_TIME_ZONE = 'Asia/Taipei'

function formatter(options: Intl.DateTimeFormatOptions, timeZone?: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    ...options,
    hour12: false,
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
  })
}

export function formatExpenseDateTime(value: string, timeZone?: string): string {
  return formatter(
    { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
    timeZone,
  ).format(new Date(value))
}

export function formatExpenseDate(value: string, timeZone?: string): string {
  return formatter(
    { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' },
    timeZone,
  ).format(new Date(value))
}

export function formatExpenseTime(value: string, timeZone?: string): string {
  return formatter({ hour: '2-digit', minute: '2-digit' }, timeZone).format(new Date(value))
}

export type DateGroup<T> = { date: string; items: T[] }

/**
 * Groups rows (already sorted by paid_at) into consecutive same-day buckets,
 * where "day" is evaluated in the given IANA time zone.
 */
export function groupByPaidDate<T extends { paid_at: string }>(
  rows: T[],
  timeZone?: string,
): DateGroup<T>[] {
  return rows.reduce<DateGroup<T>[]>((groups, row) => {
    const date = formatExpenseDate(row.paid_at, timeZone)
    const lastGroup = groups.at(-1)
    if (lastGroup?.date === date) {
      lastGroup.items.push(row)
    } else {
      groups.push({ date, items: [row] })
    }
    return groups
  }, [])
}
