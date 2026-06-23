// Pure helpers for push notifications: recipient selection and copy. No I/O.

export type NotificationPayload = { title: string; body: string; url: string }

/** Splitters who must approve = everyone in the splits except the creator. */
export function pendingRecipients(splits: { user_id: string }[], creatorId: string): string[] {
  return [...new Set(splits.map(s => s.user_id))].filter(id => id !== creatorId)
}

export function approvalNeededPayload(expenseTitle: string): NotificationPayload {
  return { title: '有費用等你審核', body: expenseTitle, url: '/review' }
}

export function rejectedPayload(expenseTitle: string, tripId: string): NotificationPayload {
  return { title: '費用被退回', body: `「${expenseTitle}」被退回,請修改後重新送審`, url: `/trips/${tripId}` }
}

export function approvedPayload(expenseTitle: string, tripId: string): NotificationPayload {
  return { title: '費用已全員通過', body: `「${expenseTitle}」已正式計入結算`, url: `/trips/${tripId}` }
}
