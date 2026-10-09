# Owner-review test Checkout pages

Created October 9, 2026 in the separate Blaze Vizionz TEST account, acct_1UOWNwCXm8prgzws.

| Deposit | Amount | Hosted test page | Payment Link ID |
| --- | ---: | --- | --- |
| Essential | $30 USD | https://buy.stripe.com/test_fZu5kC6mag6TbLWbSF7Zu00 | plink_1UOXYwCXm8prgzwsO0NWGMbC |
| Signature | $45 USD | https://buy.stripe.com/test_bJefZgh0O3k73fq5uh7Zu01 | plink_1UOXZeCXm8prgzwsurJ3wkmn |

Hosted pages verified: Sandbox label, merchant Blazing Visuals, correct deposit total, fixed quantity 1, Cards only. No taxes, promotional codes, subscriptions, tips, BNPL, or saved-payment-method option configured. Shared test payment configuration: Cards enabled, 37 other methods disabled. Live account settings and Grailed were untouched.

No payment was submitted. These are owner-review previews, not the appointment booking integration. They have not been added to production navigation. They do not reserve appointments, contain per-booking metadata, or confirm bookings. Do not distribute them as the real booking workflow.

Production must continue using server-created Checkout Sessions after an exclusive appointment hold, with signed webhook verification before confirmation. The current integration unit suite passes 21 tests. Full real Stripe Checkout/webhook/email tests still require the Blazevisionz account-specific API credential, webhook secret, transactional email setup, and review of launch terms/tax requirements. The connector still returns only Grailed despite the owner's reported reauthorization; no Grailed API access was used. Live payments remain paused pending Stripe's response to the authorized support request.
