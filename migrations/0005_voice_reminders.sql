CREATE TABLE voice_jobs (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 consult_slot TEXT NOT NULL REFERENCES slots(id),
 attempted INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('unknown','accepted','canceled')),
 call_sid TEXT UNIQUE
);
CREATE INDEX voice_jobs_attempted ON voice_jobs(attempted);
