-- Add optional date range columns to trips
ALTER TABLE trips
  ADD COLUMN start_date date,
  ADD COLUMN end_date   date;

-- Extend activity_logs action enum to include trip info updates
ALTER TABLE activity_logs DROP CONSTRAINT activity_logs_action_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN (
    'trip.created', 'trip.rate_updated', 'trip.info_updated', 'member.joined',
    'expense.created', 'expense.updated', 'expense.deleted'
  ));

-- Redefine create_trip with optional date params (backward compatible defaults)
CREATE OR REPLACE FUNCTION create_trip(
  p_name         text,
  p_exchange_rate numeric,
  p_start_date   date DEFAULT NULL,
  p_end_date     date DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate, start_date, end_date)
  VALUES (p_name, auth.uid(), p_exchange_rate, p_start_date, p_end_date)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());

  INSERT INTO activity_logs (trip_id, actor_id, action)
  VALUES (v_trip_id, auth.uid(), 'trip.created');

  RETURN v_trip_id;
END;
$$;

-- New RPC: update trip name and dates (creator only)
CREATE OR REPLACE FUNCTION update_trip_info(
  p_trip_id    uuid,
  p_name       text,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'EMPTY_NAME'; END IF;

  UPDATE trips
  SET name = trim(p_name), start_date = p_start_date, end_date = p_end_date
  WHERE id = p_trip_id;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'trip.info_updated',
          jsonb_build_object('name', trim(p_name)));
END;
$$;
