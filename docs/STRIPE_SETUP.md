# Stripe account and catalog status

Separate account verified in browser: **Blaze Vizionz**, `acct_1UOWNwCXm8prgzws`. Customer-facing name: **Blazing Visuals**. Creative identity: **Blazevisionz**. This is a direct photography business, not a marketplace.

Grailed `acct_1UOW4FE7XK7nqpgy` was not modified. The plugin still lists only that account at the last check; authorizing the separate account is required for plugin operations. Browser setup was scoped to the new account.

Owner personally completed the final onboarding agreement. The account initially showed Payments paused. **A fresh live-account browser check on October 9, 2026 shows Payments and Payouts active, with no active tasks.** Stripe Support has been asked to confirm whether the earlier pause is fully resolved. Optional Verified and Cartes Bancaires statuses do not establish a general card-payment restriction. No live charge was attempted. API capability verification and complete integration testing remain required before public Checkout opens.

Website: https://blazevisionz.com . Professional photography description and Photography studios category saved. DBA Blazing Visuals and descriptor BLAZING VISUALS saved. Owner approved public support details in Stripe; they are not copied into this repository. Two-step authentication on; included Radar Lite; no paid climate contribution or automatic tax setup.

## Test catalog created through Stripe browser

| Service | Product | Price type | USD | Price ID |
| --- | --- | --- | ---: | --- |
| Essential | prod_VPLKZSCWbQ2gdt | Full session | 100 | price_1UOWdsCXm8prgzwsGtnY3nkc |
| Essential | prod_VPLKZSCWbQ2gdt | Deposit | 30 | price_1UOWe9CXm8prgzwszFTK5hvP |
| Essential | prod_VPLKZSCWbQ2gdt | Balance | 70 | price_1UOWeQCXm8prgzwsj3x3voW0 |
| Signature | prod_VPLL4fptG4pEUw | Full session | 150 | price_1UOWetCXm8prgzws8AZW7eAP |
| Signature | prod_VPLL4fptG4pEUw | Deposit | 45 | price_1UOWfNCXm8prgzwsTG5Y7k5y |
| Signature | prod_VPLL4fptG4pEUw | Balance | 105 | price_1UOWfcCXm8prgzws3Q9WkBvn |
| Additional edited image | prod_VPLMLh6kVt6CzS | One image | 20 | price_1UOWfyCXm8prgzwswINqqf6t |

All prices are one-time and test-only. Two owner-review test deposit links have now been created (see TEST_CHECKOUT.md); no subscriptions, production payment links, or live products were created. Backend currently uses server-owned inline price_data with the same approved amounts, not frontend-submitted price IDs. Catalog IDs provide an audit record; a later switch to catalog prices must validate mode and amount.

## BNPL investigation

Dedicated card-only TEST configuration verified: `pmc_1UOWl1CXm8prgzwsFcsPRVxg`, named Blazevisionz deposits and balances. Enabled: Cards only. Disabled: 37 other methods, including Link, BNPL, and bank payments. The shared TEST default configuration `pmc_1UOWOWCXm8prgzwsGnAg3dG8` was also reduced to Cards only so browser-created test Payment Links exclude BNPL/bank/wallet methods. Verified Enabled 1 / Disabled 37 / Requires action 0. Live settings were untouched.

Eligibility is account-, category-, country-, amount-, and payment-method-specific. Stripe documentation notes account review and prohibited/restricted categories, including pre-orders for Afterpay. Scheduled photography deposits need explicit eligibility confirmation; no account-specific Afterpay/Klarna/Affirm approval has been verified.

References: https://docs.stripe.com/payments/afterpay-clearpay , https://docs.stripe.com/payments/klarna , https://docs.stripe.com/payments/affirm . BNPL is excluded from Checkout. Configure and test a card-only payment method configuration; do not advertise installments or use BNPL for split deposits until Stripe supports the exact service and the reconciliation/refund policy is reviewed.

## Secure server configuration still required

Use a restricted account-specific API key where possible with Account read, Checkout Sessions write/read, and payment verification access. Configure the correct signed webhook secret. Place secrets only in Cloudflare secret bindings using the dashboard or `wrangler secret put --config wrangler.worker.jsonc`. Never paste secrets into chat, frontend code, commits, or public logs.

Required secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TOKEN_ENCRYPTION_KEY, RESEND_API_KEY. Required nonsecrets include EXPECTED_STRIPE_ACCOUNT, STRIPE_PAYMENT_CONFIGURATION, SITE_URL, EMAIL_FROM, CONTACT_EMAIL, ADMIN_EMAIL, Access audience/domain, approved TERMS_VERSION, and launch flags.

October 9 update: owner-approved restricted TEST key created with Accounts read, Checkout Sessions write, and Payment Method Configurations read. Real API verification confirmed the correct account and card-only configuration; Essential $30 and Signature $45 session creation, duplicate rejection, unpaid holds, and expiration passed. No card was submitted. The preview encryption secret is installed. Stripe key installation and webhook setup are being completed; signed event delivery, sender delivery, and mobile Checkout are still launch blockers. No live credentials were created.

Sandbox and live use different credentials, webhook endpoints, databases, payment configurations, and product IDs. Never use Grailed credentials. Do not copy sandbox products into live until live account identity/capabilities and launch requirements are verified.
