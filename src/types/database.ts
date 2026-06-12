export type Currency = 'JPY' | 'TWD'

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
  created_at: string
}

export type ExpenseSplit = {
  expense_id: string
  user_id: string
  amount: number
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

export type ActivityAction =
  | 'trip.created'
  | 'trip.rate_updated'
  | 'member.joined'
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'

// Changed-fields-only diff stored in activity_logs.details.old / .new.
// amount and currency are always written together.
export type ExpenseDiff = {
  title?: string
  amount?: number
  currency?: Currency
  paid_by?: string
  paid_at?: string
  splits?: SplitInput[]
}

export type ActivityDetails = {
  title?: string
  amount?: number
  currency?: Currency
  old_rate?: number
  new_rate?: number
  old?: ExpenseDiff
  new?: ExpenseDiff
}

export type ActivityLog = {
  id: string
  trip_id: string
  actor_id: string
  action: ActivityAction
  details: ActivityDetails
  created_at: string
}
