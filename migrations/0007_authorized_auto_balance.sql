-- Opt-in off-session balance collection for NEW future bookings only.
-- Historical bookings default to manual collection, including external projects.
ALTER TABLE bookings ADD COLUMN auto_balance_consent INTEGER NOT NULL DEFAULT 0 CHECK(auto_balance_consent IN (0,1));
ALTER TABLE bookings ADD COLUMN auto_balance_customer TEXT;
ALTER TABLE bookings ADD COLUMN auto_balance_method TEXT;
ALTER TABLE bookings ADD COLUMN auto_balance_ready INTEGER;
ALTER TABLE bookings ADD COLUMN auto_balance_attempt INTEGER;
ALTER TABLE bookings ADD COLUMN auto_balance_intent TEXT;
CREATE UNIQUE INDEX unique_auto_balance_intent ON bookings(auto_balance_intent) WHERE auto_balance_intent IS NOT NULL;
ALTER TABLE bookings ADD COLUMN auto_balance_status TEXT NOT NULL DEFAULT 'manual' CHECK(auto_balance_status IN ('manual','authorized','notified','charging','paid','failed','review'));
CREATE INDEX auto_balance_ready_idx ON bookings(auto_balance_ready,auto_balance_attempt) WHERE auto_balance_consent=1 AND balance_paid=0;
