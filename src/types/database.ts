export type Currency = 'JPY' | 'KRW' | 'VND' | 'USD' | 'HKD' | 'CNY' | 'EUR' | 'THB' | 'GBP' | 'TWD'

/** Any currency a trip can use as its foreign currency — everything except the home currency TWD. */
export type ForeignCurrency = Exclude<Currency, 'TWD'>

export type ExpenseKind = 'expense' | 'settlement'

export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export type Trip = {
  id: string
  name: string
  created_by: string
  exchange_rate: number
  invite_token: string
  created_at: string
  start_date: string | null
  end_date: string | null
  foreign_currency: Currency
}

export type TripMember = {
  trip_id: string
  user_id: string
  joined_at: string
}

export type Expense = {
  id: string
  trip_id: string
  title: string
  amount: number
  currency: Currency
  paid_by: string
  created_by: string
  paid_at: string
  note: string | null
  created_at: string
  kind: ExpenseKind
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ExpenseSplit = {
  expense_id: string
  user_id: string
  amount: number
  approval_status: ApprovalStatus
}

export type SplitInput = {
  user_id: string
  amount: number
}

// Join type for display
export type TripWithMembers = Trip & {
  trip_members: Array<TripMember & { profiles: Profile }>
}

export type ExpenseWithSplits = Expense & {
  expense_splits: ExpenseSplit[]
  payer: Profile
}

// Changed-fields-only diff stored in activity_logs.details.old / .new.
// amount and currency are always written together.
export type ExpenseDiff = {
  title?: string
  amount?: number
  currency?: Currency
  paid_by?: string
  paid_at?: string
  note?: string | null
  splits?: SplitInput[]
}

// Discriminated on action so consumers get narrowing per event shape.
export type ActivityEvent =
  | { action: 'trip.created' | 'member.joined'; details: Record<string, never> }
  | { action: 'trip.rate_updated'; details: { old_rate: number; new_rate: number } }
  | { action: 'expense.created' | 'expense.deleted'; details: { title: string; amount: number; currency: Currency } }
  // title is the post-update title snapshot, for display
  | { action: 'expense.updated'; details: { title: string; old: ExpenseDiff; new: ExpenseDiff } }
  | { action: 'settlement.created'; details: { amount: number; currency: Currency; to_user: string } }
  | { action: 'settlement.deleted'; details: { title: string; amount: number; currency: Currency; to_user: string } }

export type ActivityAction = ActivityEvent['action']

export type ActivityLog = {
  id: string
  trip_id: string
  actor_id: string
  created_at: string
} & ActivityEvent

export type PaymentAccount = {
  user_id: string
  bank_code: string
  account_number: string
  account_holder: string | null
  updated_at: string
}

export type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}
