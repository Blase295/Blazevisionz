ALTER TABLE bookings ADD COLUMN email_verified INTEGER;
ALTER TABLE bookings ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0 CHECK(sandbox IN (0,1));
CREATE TABLE email_verifications (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 token_hash TEXT NOT NULL UNIQUE,
 token_cipher TEXT NOT NULL,
 expires INTEGER NOT NULL,
 consumed INTEGER
);
CREATE TRIGGER consume_email_verification AFTER UPDATE OF consumed ON email_verifications
WHEN OLD.consumed IS NULL AND NEW.consumed IS NOT NULL BEGIN
 UPDATE bookings SET email_verified=NEW.consumed,expires=NEW.consumed+1860
 WHERE id=NEW.booking_id AND status='held' AND expires>NEW.consumed;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Reservation expired') END;
END;
ALTER TABLE outbox ADD COLUMN lease_id TEXT;
ALTER TABLE outbox ADD COLUMN lease_until INTEGER;
ALTER TABLE outbox ADD COLUMN first_attempt INTEGER;
ALTER TABLE outbox ADD COLUMN provider_id TEXT;
ALTER TABLE outbox ADD COLUMN payload_cipher TEXT;
CREATE TRIGGER require_verified_email BEFORE UPDATE OF status ON bookings
WHEN NEW.status IN ('confirmed','completed') BEGIN
 SELECT CASE WHEN NEW.email_verified IS NULL THEN RAISE(ABORT,'Email ownership verification required') END;
END;
CREATE TRIGGER immutable_booking_email BEFORE UPDATE OF email ON bookings
WHEN NEW.email != OLD.email BEGIN
 SELECT RAISE(ABORT,'Create a new verified identity to change the booking email');
END;
