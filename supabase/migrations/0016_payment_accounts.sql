-- supabase/migrations/0016_payment_accounts.sql
-- Payment accounts: each user maintains at most one receiving bank account
-- (user_id is the PK). Saving an account IS consent to share it — any member
-- of a trip the owner belongs to can read it, but only through the
-- get_trip_payment_accounts RPC (RLS blocks all direct reads by non-owners).
-- The app only displays/copies the info; transfers happen in the bank app.
--
-- ponytail: one account per user, no per-trip sharing table. Split out an id
-- PK + trip_payment_accounts join table if per-trip account choice is ever needed.

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE payment_accounts (
  user_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  bank_code      text NOT NULL CHECK (bank_code ~ '^[0-9]{3}$'),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{6,16}$'),
  account_holder text CHECK (account_holder IS NULL OR char_length(account_holder) BETWEEN 1 AND 30),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;

-- Owner-only direct access. Everyone else must go through the RPC below,
-- which verifies shared trip membership.
CREATE POLICY "payment_accounts_own" ON payment_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- get_trip_payment_accounts
-- Returns the payment accounts of all members of the given trip.
-- Caller must be a member of that trip.
-- ============================================================

CREATE OR REPLACE FUNCTION get_trip_payment_accounts(p_trip_id uuid)
RETURNS TABLE (user_id uuid, bank_code text, account_number text, account_holder text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trip_members tm
    WHERE tm.trip_id = p_trip_id AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  RETURN QUERY
    SELECT pa.user_id, pa.bank_code, pa.account_number, pa.account_holder
    FROM payment_accounts pa
    JOIN trip_members tm ON tm.user_id = pa.user_id AND tm.trip_id = p_trip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_trip_payment_accounts(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION get_trip_payment_accounts(uuid) TO authenticated;
