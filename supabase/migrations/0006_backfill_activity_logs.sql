-- Backfill expense.created events for expenses created before activity logging was introduced.
-- Idempotent: skips expenses that already have a matching log entry.
INSERT INTO activity_logs (trip_id, actor_id, action, details, created_at)
SELECT
  e.trip_id,
  e.created_by,
  'expense.created',
  jsonb_build_object(
    'expense_id', e.id,
    'title', e.title,
    'amount', e.amount,
    'currency', e.currency,
    'paid_by', e.paid_by,
    'paid_at', e.paid_at
  ),
  e.created_at
FROM expenses e
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs al
  WHERE al.action = 'expense.created'
    AND (al.details->>'expense_id') = e.id::text
);
