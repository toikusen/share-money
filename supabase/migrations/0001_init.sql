-- supabase/migrations/0001_init.sql

-- Profiles (mirrors auth.users)
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  avatar_url      text,
  created_at      timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trips
CREATE TABLE trips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  created_by    uuid NOT NULL REFERENCES profiles(id),
  exchange_rate numeric(10,4) NOT NULL CHECK (exchange_rate > 0),
  invite_token  uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at    timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_select" ON trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_members.trip_id = trips.id AND trip_members.user_id = auth.uid()
  ));
CREATE POLICY "trips_delete" ON trips FOR DELETE TO authenticated
  USING (created_by = auth.uid());
-- No INSERT/UPDATE policy: SECURITY DEFINER functions only

-- Trip Members
CREATE TABLE trip_members (
  trip_id   uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES profiles(id),
  joined_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_members_select" ON trip_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_members tm
    WHERE tm.trip_id = trip_members.trip_id AND tm.user_id = auth.uid()
  ));
-- No INSERT policy: SECURITY DEFINER functions only

-- Expenses
CREATE TABLE expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title       text NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  currency    text NOT NULL CHECK (currency IN ('JPY', 'TWD')),
  paid_by     uuid NOT NULL REFERENCES profiles(id),
  created_by  uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT jpy_integer_amount CHECK (currency = 'TWD' OR amount = floor(amount))
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select" ON expenses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_members.trip_id = expenses.trip_id AND trip_members.user_id = auth.uid()
  ));
CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated
  USING (created_by = auth.uid());
-- No INSERT policy: SECURITY DEFINER functions only

-- Expense Splits
CREATE TABLE expense_splits (
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id),
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, user_id)
);
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_splits_select" ON expense_splits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM expenses e
    JOIN trip_members tm ON tm.trip_id = e.trip_id
    WHERE e.id = expense_splits.expense_id AND tm.user_id = auth.uid()
  ));
-- No INSERT policy: SECURITY DEFINER functions only
