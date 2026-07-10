-- Drop the stale 2-arg create_trip(text, numeric) overload left over from 0005.
-- Superseded by the 5-arg version in 0012 (name, rate, start, end, foreign_currency);
-- no caller uses the 2-arg form. Removing it eliminates a latent overload ambiguity.
DROP FUNCTION IF EXISTS create_trip(text, numeric);
