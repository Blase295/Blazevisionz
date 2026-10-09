CREATE TRIGGER protect_occupied_slot BEFORE UPDATE OF open ON slots WHEN NEW.open=0 AND OLD.open=1 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE slot_id=OLD.id AND status IN ('held','confirmed','completed','payment_review')) OR EXISTS(SELECT 1 FROM consultations c JOIN bookings b ON b.id=c.booking_id WHERE c.slot_id=OLD.id AND b.status IN ('confirmed','completed')) THEN RAISE(ABORT,'Occupied appointment cannot be closed') END;
END;
