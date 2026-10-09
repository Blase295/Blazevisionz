# Blazing Visuals studio operations

## Current deployment

Website: https://blazevisionz.blazevisionz.workers.dev

Preview: https://blazevisionz-preview.blazevisionz.workers.dev

Owner schedule: https://blazevisionz.blazevisionz.workers.dev/admin.html

Cloudflare account: `6e87eeb946761a41b98f852ec548e81a`. Preview D1: `5d692580-632e-4687-bab0-0ff3fe6f017c`. Only Blazevisionz resources are used. No B4US repository or Grailed configuration is part of this application.

Both deployed Workers contain the site and API, bind their separate databases, and has a ten-minute maintenance schedule. They have no Stripe or email secrets and cannot accept payments. Cloudflare Access protects the admin paths with owner email sign-in, and the API independently validates the Access JWT signature, issuer, audience, and owner email. Verify owner login before launch.

## Open a week

1. Sign in to the studio admin. Choose Monday for the weekly limit. Initial maximum is six.
2. Add at least two non-overlapping B4US creative blocks within that week. Choose their real duration; no default commitments are invented.
3. Add security shifts, family commitments, travel, and other unavailable periods.
4. Open individual Wednesday–Sunday photography appointments. Slots are not recurring. Enter sufficient duration for the service and preparation/travel buffers.
5. Open separate ten-minute consultation appointments. They can be on other days, but must be before the client's shoot.
6. Close individual appointments or entire dates as needed. Occupied appointments cannot be closed until their bookings are explicitly canceled or rescheduled.

All stored timestamps are UTC seconds. Input and display use America/Chicago; nonexistent or ambiguous daylight-saving times are rejected. Database triggers enforce commitments, slot buffers, the six-session maximum, service duration, and active slot uniqueness. Pending deposit holds count against the weekly limit. Completing twenty paid sessions does not change prices.

## Deposit and confirmation

Only server-calculated amounts enter Checkout. Essential: $30 deposit plus $70 balance; Signature: $45 plus $105. Prices are one-time USD charges. A restricted card-only payment-method configuration is required before launch. BNPL is excluded pending account-specific eligibility and a separately approved reconciliation policy.

The database creates an exclusive hold before Stripe Checkout. Holds last approximately 31 minutes, matching Checkout's minimum expiration window. A canceled browser checkout does not release an appointment immediately: the Stripe session can still be paid. The webhook and maintenance task retrieve Stripe state before confirming or releasing it. Unknown network outcomes remain blocked for owner reconciliation.

Webhook endpoint: `/api/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Verify signatures over raw request bytes. Retrieve the session and account on the server, check account ID, test/live mode, session ID, metadata, USD amount, and paid status. Deposit confirmation and outbox entries are one database transaction. Repeated event deliveries cannot duplicate a booking or its confirmation email. Browser redirects are informational only.

If a checkout was created but its ID was not saved, inspect the correct Stripe account using the booking ID/client reference. Associate the verified session ID with the held booking through a controlled owner repair; do not release an unknown payment. This recovery is intentionally manual and must be tested before public launch.

## Client portal and consultation

Confirmation contains a private portal link. Tokens use 32 cryptographically random bytes, are hashed for authentication, and encrypted with AES-GCM at rest. The token is in the URL fragment, removed from the address bar after load, and transmitted in the Authorization header. Treat the link as confidential and forward neither it nor the intake. Rotating the encryption secret requires a migration/reissue plan.

The portal checks verified deposit and active status before exposing intake, consultations, galleries, or balance checkout. Intake creates an internal brief. Consultation is exactly ten minutes and requires completed intake. A consultation slot can be claimed once. Optional portfolio consent is recorded separately with a timestamp; the photographer must honor withdrawal and any third-party release requirements.

## Email operations

Email provider adapter: Resend. A verified sender domain, owner-approved contact email, and secret API credential are required. No emails have been sent in the deployed preview.

Outbox handles verified booking confirmation, owner notification, creative brief, consultation confirmation/reminder, shoot reminder, balance receipt, proof availability, final delivery, cancellation, and review request. A scheduled Worker processes it every ten minutes. Failed emails remain pending with a bounded retry count. Inspect failures; do not assume an email reached an inbox merely because a provider accepted it. Provider idempotency reduces duplicate sends; retry windows and concurrent job behavior need end-to-end testing.

Set Stripe customer receipt options in the correct account after validating its public details. The application also sends a verified balance payment notice. It does not automatically charge a saved card or create recurring payments.

## Balance, proof gallery, and final images

The client can open remaining-balance Checkout from their private portal. A unique attempt record fixes the expiry and idempotency key so repeated clicks return one Checkout. Verified payment updates the balance state.

The photographer hosts proofs and final JPEGs with a private, permission-controlled gallery provider. The admin records the HTTPS proof link. The portal collects exactly the included number of image identifiers and sends the selection to the owner. Additional image orders require a separately approved $20-per-image invoice; there is no untested automatic extras checkout.

Admin delivery requires verified balance and recorded selections. Store a private final download link and send the delivery notice. Mark a fully paid finished session complete. The system schedules a feedback/review email three days after delivery; a real review URL is optional. No fabricated review is published.

Gallery creation/upload, actual editing, expiration/password configuration, and image files remain photographer actions. An HTTPS link alone does not prove that a gallery is private: verify its access control before sharing it.

## Changes, cancellations, refunds

Owner can reschedule a confirmed booking to a released appointment; the database enforces conflicts and weekly limits. Existing consultation is cleared for rebooking and pending messages are regenerated. Agree to the change with the client first. No extra deposit is created by moving a booking.

Cancellation revokes client access, clears the consultation and pending reminders, and sends a cancellation notice. It does not issue a refund. Handle approved refunds in the separate Stripe account, document refund ID and outcome, and notify the client. Cancellation/refund rules must be approved before launch. Paid sessions must never be canceled solely from a browser return URL.

## Launch blockers and checks

- Correct account and charges/payouts capability independently verified.
- Secure sandbox credentials, webhook secret, verified email sender, and token encryption secret installed.
- Correct card-only payment configuration and real Checkout tests.
- Contact email, delivery deadline, cancellation/rescheduling/refund rules, image usage terms, privacy/data-retention policy approved and published.
- Texas photography tax treatment, permit/registration, and whether listed rates include applicable tax reviewed. Texas Comptroller lists photography among taxable activities: https://comptroller.texas.gov/taxes/publications/96-259.php . Do not enable automatic tax or add an invented rate/registration.
- Real test cards: Essential/Signature deposits and balances; cancellation, declines, authentication, repeated events, simultaneous reservations, rescheduling, consultation access, sender delivery, reminders, and mobile Checkout.
- Owner signs into the admin and creates real future availability; no appointments are seeded automatically.
- Production uses a separate D1 database, Access application, Stripe secrets, webhook, sender configuration, and deployment variables. Preview cannot use live mode.
- Final domain/HTTPS, accessibility, secrets scan, and Git automatic deployment verified.

Launch flags are intentionally false: `PAYMENTS_ENABLED`, `TERMS_APPROVED`, `TAX_REVIEW_COMPLETE`, `LAUNCH_TESTS_PASSED`. Flip only after the checklist has evidence; flags alone are not evidence.
