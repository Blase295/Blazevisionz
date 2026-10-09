CREATE TABLE weeks (week TEXT PRIMARY KEY, booking_limit INTEGER NOT NULL DEFAULT 6 CHECK(booking_limit BETWEEN 1 AND 6));
CREATE TABLE blocks (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('b4us','security','family','other')), start INTEGER NOT NULL, end INTEGER NOT NULL CHECK(end > start), week TEXT NOT NULL);
CREATE TABLE slots (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('shoot','consult')), start INTEGER NOT NULL, end INTEGER NOT NULL CHECK(end > start), before_minutes INTEGER NOT NULL DEFAULT 30 CHECK(before_minutes BETWEEN 0 AND 180), after_minutes INTEGER NOT NULL DEFAULT 30 CHECK(after_minutes BETWEEN 0 AND 180), week TEXT NOT NULL REFERENCES weeks(week), local_date TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1 CHECK(open IN (0,1)));
CREATE TABLE bookings (id TEXT PRIMARY KEY, slot_id TEXT NOT NULL REFERENCES slots(id), package TEXT NOT NULL CHECK(package IN ('essential','signature')), name TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('held','confirmed','canceled','expired','completed','payment_review')), created INTEGER NOT NULL, expires INTEGER NOT NULL, checkout_id TEXT UNIQUE, deposit_paid INTEGER NOT NULL DEFAULT 0 CHECK(deposit_paid IN (0,1)), balance_paid INTEGER NOT NULL DEFAULT 0 CHECK(balance_paid IN (0,1)), balance_checkout_id TEXT UNIQUE, token_hash TEXT UNIQUE NOT NULL, token_cipher TEXT NOT NULL, intake TEXT, consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0,1)), consent_updated INTEGER, selections TEXT, proof_url TEXT, delivery_url TEXT);
CREATE UNIQUE INDEX one_active_booking ON bookings(slot_id) WHERE status IN ('held','confirmed','completed','payment_review');
CREATE TABLE consultations (booking_id TEXT PRIMARY KEY REFERENCES bookings(id), slot_id TEXT NOT NULL UNIQUE REFERENCES slots(id));
CREATE TABLE payment_events (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE outbox (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id), kind TEXT NOT NULL, due INTEGER NOT NULL, sent INTEGER, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);
CREATE TABLE audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE checkout_attempts (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TRIGGER validate_slot BEFORE INSERT ON slots BEGIN
 SELECT CASE WHEN NEW.kind='shoot' AND (SELECT COUNT(*) FROM blocks WHERE kind='b4us' AND week=NEW.week)<2 THEN RAISE(ABORT,'Protect two B4US blocks first') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM blocks WHERE start<NEW.end+NEW.after_minutes*60 AND end>NEW.start-NEW.before_minutes*60) THEN RAISE(ABORT,'Appointment overlaps a commitment') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM slots WHERE open=1 AND start-before_minutes*60<NEW.end+NEW.after_minutes*60 AND end+after_minutes*60>NEW.start-NEW.before_minutes*60) THEN RAISE(ABORT,'Appointment and buffer conflict') END;
END;
CREATE TRIGGER validate_block BEFORE INSERT ON blocks BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM slots WHERE open=1 AND start-before_minutes*60<NEW.end AND end+after_minutes*60>NEW.start) THEN RAISE(ABORT,'Close conflicting appointments before blocking time') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM blocks WHERE start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'Commitment overlaps another block') END;
END;
CREATE TRIGGER validate_booking BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM slots WHERE id=NEW.slot_id AND kind='shoot' AND open=1 AND start>NEW.created AND end-start>=CASE WHEN NEW.package='essential' THEN 1800 ELSE 3600 END) THEN RAISE(ABORT,'Appointment unavailable') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM bookings b JOIN slots s ON s.id=b.slot_id WHERE s.week=(SELECT week FROM slots WHERE id=NEW.slot_id) AND b.status IN ('held','confirmed','completed','payment_review')) >= (SELECT w.booking_limit FROM weeks w JOIN slots s ON s.week=w.week WHERE s.id=NEW.slot_id) THEN RAISE(ABORT,'Weekly booking limit reached') END;
END;
CREATE TRIGGER validate_consult BEFORE INSERT ON consultations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND deposit_paid=1 AND status IN ('confirmed','completed') AND intake IS NOT NULL) THEN RAISE(ABORT,'Paid booking and intake required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM slots WHERE id=NEW.slot_id AND kind='consult' AND open=1 AND end-start=600 AND start>unixepoch()) THEN RAISE(ABORT,'Consultation unavailable') END;
END;
CREATE TRIGGER protect_paid BEFORE UPDATE OF status ON bookings WHEN NEW.status IN ('confirmed','completed') BEGIN
 SELECT CASE WHEN NEW.deposit_paid != 1 THEN RAISE(ABORT,'Verified deposit required') END;
END;
CREATE TRIGGER validate_booking_move BEFORE UPDATE OF slot_id ON bookings WHEN NEW.slot_id!=OLD.slot_id BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM slots WHERE id=NEW.slot_id AND kind='shoot' AND open=1 AND start>unixepoch() AND end-start>=CASE WHEN NEW.package='essential' THEN 1800 ELSE 3600 END) THEN RAISE(ABORT,'Appointment unavailable') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM bookings b JOIN slots s ON s.id=b.slot_id WHERE b.id!=OLD.id AND s.week=(SELECT week FROM slots WHERE id=NEW.slot_id) AND b.status IN ('held','confirmed','completed','payment_review')) >= (SELECT w.booking_limit FROM weeks w JOIN slots s ON s.week=w.week WHERE s.id=NEW.slot_id) THEN RAISE(ABORT,'Weekly booking limit reached') END;
END;
