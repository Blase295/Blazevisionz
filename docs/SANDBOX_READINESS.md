# Blazevisionz sandbox implementation — October 21, 2026

This change extends the existing repository and preview Worker. Public checkout remains disabled. No production deployment, live payment, Grailed change, B4US change, or real customer email was performed.

## Current verification

- Repository baseline: `617674ec8b87923942b5d43a1a801d9c8cb5c973` on main. Work branch: `codex/sandbox-booking-verification`.
- Production and existing preview `/api/availability` both returned HTTP 200 with `paymentsEnabled:false` and no slots. Production HTML still displayed the old $150 Signature price at inspection; this branch corrects it.
- Cloudflare and Stripe browser dashboards required sign-in. Wrangler reported unauthenticated. Historical account/catalog entries in other documents are not current account verification.
- Expected Blaze Vizionz account and existing preview database/configuration are retained. Account identity must be verified after sign-in before remote changes.

## Implemented behavior

| Catalog | Approved total | Behavior |
|---|---:|---|
| Essential | $100, 30m, 3 edits | Retains existing $30/$70 split; gated email verification and Checkout |
| Signature | $125, 60m, 5 edits | Deposit and balance are null; all payment attempts blocked pending approval |
| Monthly Edit | $125/month, 60m, 7 edits + usable RAWs | Catalog/display only; no recurring subscription or automatic charge created |
| Personal full RAW add-on | $50 | Catalog/display only; no automatic extra payment created |
| Campaign Production | $450, 2h, 2 locations | Consultation-first inquiry, then scope/quote/agreement/payment |

The database reserves a slot before any Stripe request. One active booking per slot, weekly caps, buffers, existing commitments, and duration checks remain enforced. Booking, terms acceptance, verification challenge, and verification outbox entry are one transaction.

The email challenge uses two cryptographically random UUIDs, SHA-256 lookup, AES-GCM encryption at rest, a 15-minute expiry, and one-time atomic consumption. Verification also marks the booking email verified and refreshes the hold to 31 minutes in the same SQL statement/trigger transaction. GET does not consume the token. The page removes the URL fragment and requires an explicit same-origin POST. Booking email changes are blocked. Prior records are not silently marked verified.

After verification, the recipient receives an opaque booking-scoped token in memory and explicitly starts Checkout. Retry uses the same booking, expiry, and Stripe idempotency key. Unknown Stripe outcomes retain the hold for reconciliation. If a verification response is lost, the tab is closed before Checkout, or an unknown Checkout cannot be reconciled, owner recovery is required; there is no unauthenticated token reissue endpoint.

Public `PAYMENTS_ENABLED` stays false. Owner-only `POST /api/sandbox/bookings` additionally requires a verified Cloudflare Access JWT, `ENVIRONMENT=preview`, `STRIPE_LIVE=false`, and `SANDBOX_CHECKOUT_ENABLED=true`. It uses `termsVersion: sandbox-fixture-v1` with `acceptedTerms:true`; those are explicitly non-live fixtures, not policy approvals. The request otherwise uses `package`, `slot`, `name`, and `email` like the existing booking endpoint. No future slots or commitments are automatically added. The sandbox flag remains false in committed configuration.

Webhook processing verifies the exact request body using Stripe's SDK and a five-minute timestamp tolerance. It checks environment and account, then retrieves the account/session server-side. Amount, currency, payment state, session ID, metadata, and email verification must match. Only verified paid state can confirm. Payment event, booking update, and confirmation outbox entries commit atomically. Duplicate deliveries/events cannot duplicate bookings or message IDs. Async failure queues review without releasing the hold; expiry is checked against Stripe. Late payments for released/canceled bookings queue owner review.

Portal tokens select one booking only. Intake/selection writes ignore user-supplied booking IDs and operate on the authorized record. Consultation still requires verified deposit and intake. Customer-facing balance payment buttons obey payment readiness.

The existing Resend adapter is preserved. Email workers claim two-minute leases, use 20-second request timeouts, save encrypted immutable payload snapshots and provider IDs, retry with backoff, and stop at 10 attempts or 23 hours after first attempt. Provider acceptance is not inbox delivery. Do not manually retry unknown sends beyond provider idempotency retention until the provider record is reconciled.

## Tests and evidence

`node --test tests/*.test.mjs`: 39 passing tests. New coverage includes pre-checkout ownership verification, expired/forged/reused/concurrently consumed links, concurrent reservation attempts, server-owned price, unapproved Signature blocking, public/sandbox gates, transaction rollback/retry, webhook tampering/stale timestamps/wrong account/mode, scoped customer reads/writes, concurrent email leases, stable retry keys, and owner review after cancellation. Existing booking/consultation/voice safeguards also pass.

`node tools/build.mjs` succeeds. `wrangler deploy --config wrangler.worker.jsonc --dry-run` bundles successfully against the existing preview configuration. `wrangler types --config wrangler.worker.jsonc` succeeds. All six migrations apply successfully to isolated local D1 storage `.wrangler/review-state`; no remote migration has been applied. The verification page was checked in the browser, including invalid-link handling. Local provider calls are mocked; these tests do not prove a real card payment, Stripe-origin delivery, remote D1 concurrency, email inbox arrival, or mobile Checkout.

The real-API verifier `tools/verify-stripe-sandbox.mjs` now exercises Essential after a clearly documented local verification fixture and requires Signature to fail closed. It was not run in this session because an authenticated account-specific test credential was unavailable. Earlier successful checks remain historical evidence only.

## Environment configuration — names only

Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`.

Variables: `ENVIRONMENT`, `PAYMENTS_ENABLED`, `SANDBOX_CHECKOUT_ENABLED`, `STRIPE_LIVE`, `EXPECTED_STRIPE_ACCOUNT`, `STRIPE_PAYMENT_CONFIGURATION`, `SITE_URL`, `EMAIL_FROM`, `CONTACT_EMAIL`, `ADMIN_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `TERMS_VERSION`, `TERMS_APPROVED`, `TAX_REVIEW_COMPLETE`, `LAUNCH_TESTS_PASSED`.

Bindings: `DB`, `BOOKING_LIMITER`, `ASSETS`. Optional local real-API verifier selector: `STRIPE_TEST_CREDENTIAL_FILE`. Store credentials in encrypted Cloudflare secrets or ignored local files; never commit values or paste them into chat.

## Owner actions and remaining checks

1. Finish Cloudflare and Stripe sign-in. Authenticate Wrangler for the existing Cloudflare account and restore GitHub write access if unavailable. This enables deployment/account inspection; browser sign-in alone does not authenticate Wrangler.
2. Verify the correct Blaze Vizionz test account and restricted test key permissions. Verify/create its test webhook destination at the existing preview `/api/webhook`, subscribing to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Install the destination-specific signing secret securely. No Grailed account actions.
3. Provide access to the existing Resend setup and confirm an owner-controlled recipient for test emails. Verify its sender domain and required SPF/DKIM DNS records, review DMARC, set sender/contact values, and install the restricted email credential. Disable link/open tracking for verification messages. No real delivery is claimed until both provider status and inbox receipt are checked. References: https://resend.com/docs/dashboard/domains/introduction and https://resend.com/docs/dashboard/emails/idempotency-keys .
4. Approve Signature's deposit/balance allocation before any Signature payment test. Essential can proceed independently in sandbox. Monthly subscriptions and RAW add-on checkout remain separate, disabled sales flows.
5. Before any live launch, approve cancellation/refund/rescheduling, delivery/privacy terms and tax treatment; no legal or tax approval is inferred from fixture flags. Confirm an owner-selected preview test slot and recipient; do not alter real availability or B4US commitments for tests.

After account access: inspect existing preview D1 migrations and bookings, apply only the additive migration to preview, deploy this branch to the existing preview Worker with public payment flags false, verify Access protection, then enable only the owner sandbox gate. Run a real Essential test card payment and actual signed webhook, verify D1 state and inbox delivery, replay delivery, exercise failure/decline/expiry/retry and remote concurrency, and verify customer isolation in preview. Record deployment ID, Stripe event/session IDs, provider message ID and delivery evidence in private test results. Keep test fixtures and production separate. Merge/live launch is a separate reviewed action.

Before migration, inspect historical active bookings: existing unverified customers will lose portal access until a controlled verification/reissue plan is completed. Do not backfill `email_verified` merely because a deposit was paid.
