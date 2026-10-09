# Owner-review test Checkout pages

Created October 9, 2026 in the separate Blaze Vizionz TEST account, acct_1UOWNwCXm8prgzws.

| Deposit | Amount | Hosted test page | Payment Link ID |
| --- | ---: | --- | --- |
| Essential | $30 USD | https://buy.stripe.com/test_fZu5kC6mag6TbLWbSF7Zu00 | plink_1UOXYwCXm8prgzwsO0NWGMbC |
| Signature | $45 USD | https://buy.stripe.com/test_bJefZgh0O3k73fq5uh7Zu01 | plink_1UOXZeCXm8prgzwsurJ3wkmn |

Hosted pages verified: Sandbox label, merchant Blazing Visuals, correct deposit total, fixed quantity 1, Cards only. No taxes, promotional codes, subscriptions, tips, BNPL, or saved-payment-method option configured. Shared test payment configuration: Cards enabled, 37 other methods disabled. Live account settings and Grailed were untouched.

No payment was submitted. These are owner-review previews, not the appointment booking integration. They have not been added to production navigation. They do not reserve appointments, contain per-booking metadata, or confirm bookings. Do not distribute them as the real booking workflow.

Production must continue using server-created Checkout Sessions after an exclusive appointment hold, with signed webhook verification before confirmation. The current suite passes 21 booking tests and 5 voice tests. Full real Stripe Checkout/webhook/email tests still require the Blazevisionz account-specific API credential, webhook secret, transactional email setup, and review of launch terms/tax requirements. The connector still returns only Grailed despite the owner's reported reauthorization; no Grailed API access was used. A fresh October 9 live-account browser check shows Payments and Payouts active, with no active tasks. Public Checkout stays closed until API capability verification and integration tests are complete.

## Real sandbox API verification

`node tools/verify-stripe-sandbox.mjs` verifies the correct account and card-only configuration, then exercises the actual booking handler against Stripe test APIs using an isolated local SQLite database. It creates and expires Essential and Signature test Checkout Sessions; checks deposit amounts, booking metadata, unpaid hold status, duplicate-booking rejection, and private-client access. It never opens public availability or enables production payments.

Credentials must be stored locally in the ignored `.dev.vars.stripe-preview.json` file as a JSON object containing `STRIPE_SECRET_KEY`, or supplied through an ignored file selected by `STRIPE_TEST_CREDENTIAL_FILE`. Only `rk_test_` or `sk_test_` credentials are accepted. Prefer a restricted test key with Accounts read, Checkout Sessions write, and Payment Method Configurations read. Provider errors are sanitized; credentials and raw provider errors are never printed. Results are written under ignored `test-results/`.

This test does not submit a card or demonstrate delivery of a real Stripe-signed webhook. Those checks, deployed database confirmation, confirmation email arrival, and mobile Checkout remain separate launch requirements. The hosted preview's required webhook URL is `https://blazevisionz-preview.blazevisionz.workers.dev/api/webhook`.

October 9 connection progress: preview `TOKEN_ENCRYPTION_KEY` is installed as a Cloudflare encrypted secret. The owner approved creation of the restricted test key with the three permissions above. The real sandbox API verifier ran successfully with that key: correct account, card-only configuration, both deposit amounts, metadata, duplicate-booking rejection, unpaid holds, private-client rejection, and Stripe session expiration passed. Both test sessions were expired; no card payment was submitted. Private results are saved in ignored `test-results/stripe-sandbox-api.json`.

The local credential file currently lives one directory above the repository. To use it without moving or exposing it, select it using `STRIPE_TEST_CREDENTIAL_FILE`. The Stripe test key is installed as an encrypted Cloudflare preview secret, verified in the dashboard and Worker secret-name API. The preview webhook destination is prepared but not created; owner confirmation at the browser credential-creation boundary is pending. Signed webhook delivery and real confirmation emails remain untested. Public Checkout remains disabled; preview owner Access and unpaid-client restrictions still pass.
