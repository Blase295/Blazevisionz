# Blazevisionz phone consultations and reminders

Account verified in browser: the verified Blazevisionz Account SID, renamed Blazevisionz — Blazing Visuals. Active trial, 30 days remaining and 75 voice minutes shown on October 9, 2026. No billing upgrade, purchased number, or test call occurred. Trial voice sender exists; the owner signup phone is a verified recipient. Neither private phone nor credentials are stored here.

Codex can manage the signed-in browser. No callable Twilio connector is available in this chat. No API connection or successful live delivery is claimed.

## Reminder implementation

The ten-minute consultation remains a personal call with the photographer. An optional automated reminder call is prepared in src/voice.mjs, separate from the consultation itself. It runs up to one hour before a paid, confirmed consultation; only valid US E.164 numbers and separately recorded opt-in qualify. A deterministic database claim prevents repeated calls, including overlapping cron runs and provider timeouts. Unknown outcomes need owner reconciliation in Twilio call logs, not an automatic retry. Six attempts per rolling 24 hours are enforced in the database. Calls have a 60-second ceiling and recording disabled. The spoken message contains only the studio name and consultation date/time, not intake details or private links. Consent can be revoked by unchecking and saving the intake; an already dispatched call cannot be recalled. API acceptance is not proof the recipient answered.

Trial calls run only in preview and only to numbers listed in TWILIO_VERIFIED_RECIPIENTS. Production requires a Full active Twilio account. Neither environment sends until all three flags TWILIO_ENABLED, TWILIO_LAUNCH_APPROVED, TWILIO_TESTS_PASSED equal true. Leave them false until owner budget/terms review and an actual delivery test pass.

Required secure connection: TWILIO_API_KEY and TWILIO_API_SECRET in Cloudflare secret bindings. Prefer a restricted key granting only Calls create/read and Accounts read; never use a Main key. Store TWILIO_ACCOUNT_SID and TWILIO_EXPECTED_ACCOUNT with the same verified Blazevisionz Account SID as Cloudflare secrets. GitHub push protection treats Account SIDs as protected strings. Set TWILIO_FROM to the assigned voice sender. Store TWILIO_VERIFIED_RECIPIENTS as a secret because it contains private phone numbers. No credentials in frontend, GitHub, or chat. This implementation does not expose an incoming Twilio webhook; outbound calls use inline TwiML and accepted/unknown outcomes are inspected through authenticated provider logs.

Apply migration 0005_voice_reminders.sql after existing migrations, deploy the preview Worker, connect credentials securely, then perform an owner-authorized trial reminder call to the verified recipient. Validate the Twilio account response, amount of free minutes used, spoken Chicago time, recording off, duplicate scheduling, consent revocation, canceled appointments, and 60-second maximum. 26 mocked/unit integration tests pass; actual Twilio delivery remains untested.

Public phone call routing requires the owner's chosen destination and a paid number/budget approval. Do not publish a temporary trial number as a permanent business line or accept paid upgrades by default. SMS reminders were not requested and are not implemented. Email confirmation/consultation reminders remain in the existing transactional outbox.

References: https://www.twilio.com/docs/usage/trials/try-out-voice , https://www.twilio.com/docs/voice/api/call-resource , https://www.twilio.com/docs/usage/security .
