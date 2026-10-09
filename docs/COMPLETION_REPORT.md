# Blazevisionz setup report — October 9, 2026

## Completed

- Inspected and preserved index.html, styles.css, script.js, README.md, and BRAND_GUIDE.md. Removed outdated Square guidance.
- Refined the original editorial site with accurate package/balance details, accessible controls, about/portfolio/booking/process/FAQ/contact-status/policy sections, and genuine portfolio placeholders.
- Deployed the website: https://blazevisionz.blazevisionz.workers.dev . Separate preview: https://blazevisionz-preview.blazevisionz.workers.dev . HTTPS verified on both.
- Separate production and preview Workers, D1 databases, Access owner applications, rate-limit namespaces, and ten-minute scheduled maintenance. Deployed source is an API-uploaded bundled equivalent of the checked-in Worker/static-assets build.
- Owner scheduling UI: individual dates/times, commitments, preparation/travel buffers, six-session cap, two protected B4US blocks before publishing a week, and cancellation/rescheduling controls. No dates were automatically opened.
- Booking backend: exclusive holds, server-owned deposit amounts, Stripe Checkout adapter, signed webhook verification, account/mode/session/amount checks, idempotent confirmation, private paid-client intake and ten-minute consultations, balance Checkout, proof/delivery links, image selections, consent tracking, and transactional email outbox.
- Operations documentation, private proposed terms, Stripe catalog IDs, test suite, local development tools, security headers, and GitHub Actions main-branch deployment workflow.
- Separate Stripe account prepared through plugin inspection and browser setup. Owner submitted legal onboarding. Customer-facing name Blazing Visuals, website production URL, Photography studios category, and BLAZING VISUALS descriptor saved. Three test products/seven prices and dedicated card-only test configuration created.
- Grailed and B4US were untouched.

## Stripe status

Correct separate account: `acct_1UOWNwCXm8prgzws` (Blaze Vizionz).

**Live Payments paused**, explicitly shown by Stripe. No active/completed task explains the pause. Afterpay/Klarna also paused. No live product, payment link, subscription, or customer charge created. Public Checkout remains disabled.

Test services: Essential $100/$30 deposit/$70 balance; Signature $150/$45 deposit/$105 balance; additional edited image $20. Product/price IDs: [STRIPE_SETUP.md](STRIPE_SETUP.md).

Verified card-only test configuration: `pmc_1UOWl1CXm8prgzwsFcsPRVxg`. Cards enabled; 37 other methods disabled. Default and live configurations unchanged. Preview config contains this public identifier; no API credential is installed.

Plugin still exposes only Grailed at the last refresh. Owner must authorize the separate account before further plugin account operations.

## Verification

| Check | Result and limit |
| --- | --- |
| Backend tests | 20 passed; actual SQLite constraints plus Stripe SDK signature verification and mocked account/session/email APIs |
| Amounts | Essential 3000+7000=10000 cents; Signature 4500+10500=15000 cents |
| Double booking/conflicts | Active unique slot, weekly limit, protected commitments/buffers, unavailable/short slots, occupied slot closure, and rescheduling checks pass |
| Webhooks | Genuine local HMAC-signed event accepted after mocked Stripe retrieval; forged signatures and wrong amount/currency/mode/session/unpaid states rejected; duplicate events do not duplicate confirmation outbox |
| Canceled/failed payments | Unpaid never confirms; expired slot can be reused; late payment against expired reservation requires owner review. Real sandbox canceled/declined Checkout still pending |
| Consultation | Verified paid booking plus intake required; ten-minute slot uniqueness enforced |
| Emails | Mocked outbox sends one confirmation/private link; failed delivery remains pending. Real sender delivery and inbox arrival not tested |
| Site | HTTPS 200, no overflow/page errors, package selector works, Checkout disabled at widths 375/768/1440 |
| Accessibility | Automated WCAG A/AA checks: zero findings at the three widths; not a complete manual accessibility audit |
| Deployed API | Availability closed; client 401; admin redirects to owner Access sign-in; booking/webhook 503 until securely configured |
| Build | Pages Functions compilation and preview/production Worker dry runs pass; production dependency audit clean |
| Privacy | No client records seeded; private pages no-store/noindex; token encryption tested; no real API keys in repository |
| Real mobile Checkout/live readiness | Not tested/verified; blocked by credentials, Stripe pause, email sender, and final policy/tax decisions |

Screenshots/results are local in ignored test-results. Live databases start with zero appointments/bookings. No real client data or simulated client photos were published.

## GitHub and automatic deployment

Working code is committed to the Blazevisionz main branch; the final chat report includes the commit link. Cloudflare direct API deployment succeeded. Native Pages Git connection failed with `8000011`: internal issue with Cloudflare Pages Git installation.

GitHub Actions is configured to verify main/PRs and deploy main through a repository CLOUDFLARE_API_TOKEN secret. Until that secret exists, the deploy job explicitly reports the blocker and skips deployment. Automatic deployment is not yet verified. Alternative: repair the Cloudflare GitHub app and grant only Blazevisionz repository access, then configure Workers Builds for this Worker.

## Exact owner actions

1. Resolve Payments paused at https://dashboard.stripe.com/acct_1UOWNwCXm8prgzws/account/status ; contact Stripe support if it continues to show no actionable requirements. Do not reuse Grailed.
2. Authorize Blaze Vizionz through the Stripe plugin account-management link, then confirm completion. This connection is separate from submitting Stripe legal onboarding.
3. Provide/approve a public studio contact email, cancellation/rescheduling/refund rules, delivery deadline, image-usage and privacy/retention terms, and Texas tax treatment/registration. Draft is private and not published as active client terms.
4. Securely configure correct sandbox Stripe restricted key/webhook secret, verified email sender/API secret, and encryption secret in Cloudflare (never chat/GitHub). Then run real sandbox deposits/balances, signed events/retries, email delivery, reminders, conflicts, and mobile Checkout. Production receives separate credentials only after the paused account is ready.
5. Configure the repository CLOUDFLARE_API_TOKEN secret or repair the Cloudflare GitHub installation for automatic builds. Token permissions/account restriction are described in README.
6. Sign in to https://blazevisionz.blazevisionz.workers.dev/admin.html using the authorized owner email; enter actual security/family/B4US blocks and release actual dates after launch approval.
7. Supply actual portfolio photography and permission records; choose a private gallery provider and verify its sharing controls. Custom domain is optional; the deployed workers.dev site already uses HTTPS.

The public booking lock stays in place until all launch checks are evidenced. Flipping configuration flags alone does not complete testing or legal/account verification.
