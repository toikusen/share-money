-- supabase/migrations/0011_account_deletion.sql
-- Account deletion keeps the shared ledger intact: the auth user is deleted,
-- but the profiles row survives as an anonymized tombstone so historic
-- expenses/splits/activity keep resolving to "已刪除使用者".

-- profiles must outlive auth.users (tombstone), so drop the cascade FK.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Deleted (tombstoned) profiles are frozen: no further client updates.
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND deleted_at IS NULL);
