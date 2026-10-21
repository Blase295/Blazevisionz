# Blazevisionz sandbox implementation — October 21, 2026

This change extends the existing repository and preview Worker. Public checkout remains disabled. No production deployment, live payment, or Grailed change was performed. The owner explicitly authorized disposable scheduling fixtures in the existing preview database. Real verification and test confirmation emails were sent only to the approved owner test recipient; real commitments and production scheduling were not changed.

## Current verification

- Repository baseline: `617674ec8b87923942b5d43a1a801d9c8cb5c973` on main. Work branch: `codex/sandbox-booking-verification`.
- Production and existing preview `/api/availability` both returned HTTP 200 with `paymentsEnabled:false` and no slots. Production HTML still displayed the old $150 Signature price at inspection; this branch corrects it.
- GitHub write access and Cloudflare deployment access are now verified. Branch published; draft PR: https://github.com/Blase295/Blazevisionz/pull/1 . The existing GitHub checks job passed; production deployment job is skipped for the PR. Cloudflare OAuth has its full supported scopes at the owner's explicit request, stored encrypted using Windows Credential Manager.
- Correct Cloudflare account and Blaze Vizionz Stripe account were verified. Stripe is explicitly in test mode. Preview had zero booking records before the additive migration. Migration 0006 is now applied remotely; no pending migrations remain. The existing preview Worker is deployed with version `a12b10f5-03b2-4320-93f5-a06ff4ce48c4`. Public checkout and sandbox entry flags remain false.

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

After verification, the recipient receives an opaque booking-scoped token in memory and explicitly starts Checkout. The first Checkout attempt fixes a fresh 31-minute expiry; retries use the same booking, stored attempt expiry, and Stripe idempotency key. Unknown Stripe outcomes retain the hold for reconciliation. If a verification response is lost, the tab is closed before Checkout, or an unknown Checkout cannot be reconciled, owner recovery is required; there is no unauthenticated token reissue endpoint.

Public `PAYMENTS_ENABLED` stays false. Owner-only `POST /api/admin/sandbox/bookings` (the legacy `/api/sandbox/bookings` alias still verifies the JWT) additionally requires a verified Cloudflare Access JWT, `ENVIRONMENT=preview`, `STRIPE_LIVE=false`, and `SANDBOX_CHECKOUT_ENABLED=true`. It uses `termsVersion: sandbox-fixture-v1` with `acceptedTerms:true`; those are explicitly non-live fixtures, not policy approvals. The request otherwise uses `package`, `slot`, `name`, and `email` like the existing booking endpoint. No future slots or commitments are automatically added. The sandbox flag remains false in committed configuration.

Webhook processing verifies the exact request body using Stripe's SDK and a five-minute timestamp tolerance. It checks environment and account, then retrieves the account/session server-side. Amount, currency, payment state, session ID, metadata, and email verification must match. Only verified paid state can confirm. Payment event, booking update, and confirmation outbox entries commit atomically. Duplicate deliveries/events cannot duplicate bookings or message IDs. Async failure queues review without releasing the hold; expiry is checked against Stripe. Late payments for released/canceled bookings queue owner review.

Portal tokens select one booking only. Intake/selection writes ignore user-supplied booking IDs and operate on the authorized record. Consultation still requires verified deposit and intake. Customer-facing balance payment buttons obey payment readiness.

The existing Resend adapter is preserved. Email workers claim two-minute leases, use 20-second request timeouts, save encrypted immutable payload snapshots and provider IDs, retry with backoff, and stop at 10 attempts or 23 hours after first attempt. Provider acceptance is not inbox delivery. Do not manually retry unknown sends beyond provider idempotency retention until the provider record is reconciled.

## Tests and evidence

`node --test tests/*.test.mjs`: 43 passing tests. New coverage includes pre-checkout ownership verification, expired/forged/reused/concurrently consumed links, concurrent reservation attempts, server-owned price, unapproved Signature blocking, public/sandbox gates, transaction rollback/retry, webhook tampering/stale timestamps/wrong account/mode, scoped customer reads/writes, concurrent email leases, stable retry keys, and owner review after cancellation. Existing booking/consultation/voice safeguards also pass.

`node tools/build.mjs` succeeds. `wrangler deploy --config wrangler.worker.jsonc --dry-run` bundles successfully against the existing preview configuration. `wrangler types --config wrangler.worker.jsonc` succeeds. All six migrations apply successfully to isolated local D1 storage `.wrangler/review-state`; migration 0006 has also been applied to the existing preview D1 after verifying that it held no booking records. The verification page was checked in the browser, including invalid-link handling. Local provider calls are mocked; these local tests do not prove a real card payment, remote D1 concurrency, email inbox arrival, or mobile Checkout. Separately, a Stripe-origin signed test event has now reached the deployed endpoint with HTTP 200, as described below.

The real-API verifier `tools/verify-stripe-sandbox.mjs` now exercises Essential after a clearly documented local verification fixture and requires Signature to fail closed. It was not run in this session because an authenticated account-specific test credential was unavailable. Earlier successful checks remain historical evidence only.

## Environment configuration — names only

Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`.

Variables: `ENVIRONMENT`, `PAYMENTS_ENABLED`, `SANDBOX_CHECKOUT_ENABLED`, `STRIPE_LIVE`, `EXPECTED_STRIPE_ACCOUNT`, `STRIPE_PAYMENT_CONFIGURATION`, `SITE_URL`, `EMAIL_FROM`, `CONTACT_EMAIL`, `ADMIN_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `TERMS_VERSION`, `TERMS_APPROVED`, `TAX_REVIEW_COMPLETE`, `LAUNCH_TESTS_PASSED`.

Bindings: `DB`, `BOOKING_LIMITER`, `ASSETS`. Optional local real-API verifier selector: `STRIPE_TEST_CREDENTIAL_FILE`. Store credentials in encrypted Cloudflare secrets or ignored local files; never commit values or paste them into chat.

## Owner actions and remaining checks

1. Account access and branch publication are resolved. No additional GitHub or Cloudflare login is currently required.
2. Test webhook is active: `we_1USs3GCXm8prgzwsHG1Th4gm`, API version `2026-09-30.endive`, account-scoped snapshot events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Its destination-specific `STRIPE_WEBHOOK_SECRET` is installed as an encrypted preview secret. A forged signature receives HTTP 400. Stripe-generated test event `evt_1USs6wCXm8prgzwsFV7rZWra` received HTTP 200 with `{received:true,ignored:true}` because it has no application booking metadata. No booking/payment/outbox records were created. This verifies actual signature and account checks, but not the complete customer payment journey. No Grailed account actions.
3. Resend account setup is complete. The owner-provided key has Sending access and is encrypted as `RESEND_API_KEY` on preview only. `mail.blazevisionz.com` is verified; its exact DKIM TXT and two required DNS-only sending CNAME records were installed. Monitoring-only DMARC is scoped to `_dmarc.mail`. Receiving and click/open tracking are not enabled. `EMAIL_FROM` and `CONTACT_EMAIL` are configured on preview. Both provider delivery status and Gmail inbox receipt were verified for the application verification email and customer/owner confirmations. No passwords or credentials were committed.
4. Approve Signature's deposit/balance allocation before any Signature payment test. Essential can proceed independently in sandbox. Monthly subscriptions and RAW add-on checkout remain separate, disabled sales flows.
5. Before any live launch, approve cancellation/refund/rescheduling, delivery/privacy terms and tax treatment; no legal or tax approval is inferred from fixture flags. The owner approved preview-only fixture scheduling and the recipient; future tests must remain isolated from real availability and commitments.

## Deployed journey evidence

The owner-approved disposable Essential fixture completed the real application journey: owner Access sign-in, atomic held reservation, verification email inbox receipt, one-time ownership verification, server-priced test Checkout, declined test card, successful retry in the same Checkout, signed Stripe webhook, confirmed D1 booking, client portal access, and customer/owner confirmation delivery. A second reservation for the same appointment returned unavailable. A manual Stripe replay returned HTTP 200 and left one payment event, one booking, and one set of email messages.

- Booking: `ef28fb66-5a80-433e-97e9-e09c522a5d6b`, `sandbox=1`.
- Checkout: `cs_test_a1Qob5tJItUBcTyzyrAGQKQC4iOhEXp160gdeyfWKODtYumTO9aiYx9jOI`; $30 USD Essential test deposit, $100 catalog total / $70 balance. No Signature allocation used.
- Completion event: `evt_1USsJVCXm8prgzws5jAvmnEc`, delivered automatically 00:43:50 CDT, manually replayed 00:44:28 CDT on October 21, both HTTP 200.
- Verification provider ID: `01a15cfb-5580-77cb-a6a0-84bc94f99a33`.
- Customer confirmation provider ID: `01a15cfc-c558-7629-8127-1d15862a7aa4`.
- Owner confirmation provider ID: `01a15cfc-c6f3-7ac7-9530-43e6c5612364`.

After evidence capture, the disposable booking was marked canceled, its unsent future reminder removed, and its two fixture appointments closed. The paid test record remains for audit; no real refund is implied. Both sandbox and public payment gates are off again. No real appointment or protected commitment was added to production.

Owner Access initially hit a redirect loop with its existing Strict SameSite setting. Directly navigating to `/admin` after sign-in succeeded; no Access security setting was reduced. Cloudflare documents this Strict-cookie behavior: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/ . The sandbox form now uses the existing Access-protected `/api/admin` path so the identity assertion is injected.

Remaining verification limits: actual provider failures/timeouts and async Stripe success/failure/expiry were covered by automated tests, not forced against remote accounts. Simultaneous competing reservations and cross-customer reads/writes were tested against local SQLite; remote D1 rejected a second request for an occupied appointment, but a simultaneous remote two-customer race was not run. A separate real balance-payment journey and mobile Checkout remain release checks. Production price corrections require reviewing and merging/deploying this branch; production still has the historical display. Live launch remains blocked on Signature split and terms/tax approvals, with all launch flags false.

Before migration, inspect historical active bookings: existing unverified customers will lose portal access until a controlled verification/reissue plan is completed. Do not backfill `email_verified` merely because a deposit was paid.
