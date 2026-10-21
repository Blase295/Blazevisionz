# Launch follow-up — October 21, 2026

## Owner decisions now applied

- Service totals below $200: 50% deposit. $200 through $500: $100. Above $500: $200. Exact $500 stays in the $100 tier. Odd-cent halves round the deposit up one cent and leave the remainder in the balance.
- Essential $100: $50 deposit / $50 service balance. Signature $125: $62.50 / $62.50. Campaign $450 base quote: $100 / $350, still consultation and written scope first. Monthly and RAW add-on payment flows remain disabled; no new recurring charges.
- Advertised prices exclude tax. The owner has no Texas sales tax permit yet. Inline prices are explicitly tax-exclusive, but automatic tax and live collection are not enabled. Permit, Stripe registration/classification, deposit/balance tax treatment, and a nonzero calculation still need verification before launch. No flat tax percentage is guessed.
- Proofs within 24–48 hours after the shoot; final edits within 24–48 hours after selections. Rescheduling is flexible, with any fee explained and agreed beforehand and exceptional circumstances considered individually.

The full proposed cancellation/refund/privacy text is in [the policy review](LAUNCH_POLICY_REVIEW.md). Refund deductions, gallery/retention periods, included corrections, and confirmation of the end-of-shoot balance deadline remain owner review items. TERMS_APPROVED and TAX_REVIEW_COMPLETE remain false.

## New verification

45 automated tests pass. New assertions cover all deposit tier boundaries and both payable personal packages. Signed delayed-payment completion remains unpaid until server state verifies payment; duplicate async failures queue one review without releasing a hold; expiry checks Stripe state and a late payment never confirms a replacement customer's booking. Existing signature verification, transactions, retries, customer isolation, and email failure/lease tests remain passing.

On the deployed preview, two simultaneous requests for one disposable appointment returned 202 and 409. D1 stored one reservation, one verification challenge, and one verification email for that slot.

Signature test booking `a0d18e1b-8c39-4e4f-b30c-446329a7212e` completed email verification, a $62.50 deposit, private portal access, and the $62.50 balance. Stripe delivered separate signed events and D1 verified both payments. The deposit Checkout was exercised at a 390×844 viewport; its document fit without horizontal overflow. This is responsive browser coverage, not a physical-phone device test.

| Evidence | ID |
|---|---|
| Deposit Checkout | `cs_test_a1QKzYs5cRnFrDa9BuhZqGPMZZ1Wfg764I19k9n2k3bESRvIjd16NhwEmK` |
| Balance Checkout | `cs_test_a1ITL5MGYrVTpDMT2fjbH9Tzc8PWgNAEdYWvxTjIHNJhfeok1LgVoBIYww` |
| Deposit event | `evt_1USsZYCXm8prgzws65U5PRU3` |
| Balance event | `evt_1USsdICXm8prgzwsv99pN0cI` |
| Verification email | `01a15d0a-7f6b-7032-8e58-c6b28556b798` |
| Customer confirmation | `01a15d0d-c24f-7bf6-bb4d-f890a3c43ddc` |
| Owner confirmation | `01a15d0d-c406-7ba6-9c27-e0684f73ba0b` |
| Balance receipt | `01a15d10-b7a0-7766-8719-9af4e28d460b` |

Signature confirmation appeared in the approved Gmail inbox. The balance receipt has a provider acceptance ID; a separate inbox/delivered check was interrupted by browser connection resets. The earlier Essential run already verified provider delivery and inbox receipt and a real webhook replay without duplication.

Remote async methods and a real expiration event were not forced in this follow-up; those handlers were exercised with signed requests and mocked Stripe state in automated tests. The account's established card-only configuration was preserved. No test claims to establish tax compliance.

Disposable test bookings were canceled after evidence capture; fixture appointments were closed and pending future reminders removed. No real appointment, production commitment, Grailed account, or B4US project was changed. Public and sandbox gates return to false after testing.

## Final preview release check

Preview Worker version `bb1c3ee2-337d-41df-9a18-36ce2efb1495` contains implementation commit `285680e`. GitHub checks for that commit passed; production deployment was correctly skipped for the pull request. The subsequent documentation/tool assertion correction does not change deployed behavior.

Final HTTP checks: availability 200 with payments disabled and no public slots; owner API redirects to Access; unauthenticated customer API returns 401; new booking requests return 503; unsigned webhook requests return 400. Webhook signature checks remain active while new checkout is closed, allowing legitimate outstanding payment events to be processed.

Read-only D1 verification confirmed both new fixture bookings canceled, zero open launch fixture slots, and zero pending fixture emails. The release remains on the existing branch and draft pull request; it has not been merged or deployed to production. Browser access detached during the final PR review, and the GitHub connector was unavailable; public GitHub API checks verified the passing CI result. PR title/body refresh and final release review remain outstanding.

## Configuration names

Existing secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`. Existing variables: `PAYMENTS_ENABLED`, `SANDBOX_CHECKOUT_ENABLED`, `STRIPE_LIVE`, `TERMS_APPROVED`, `TERMS_VERSION`, `TAX_REVIEW_COMPLETE`, `LAUNCH_TESTS_PASSED`, `EMAIL_FROM`, `CONTACT_EMAIL`, `ADMIN_EMAIL`, `EXPECTED_STRIPE_ACCOUNT`, `STRIPE_PAYMENT_CONFIGURATION`, `SITE_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ENVIRONMENT`. No secret values are included here.

## Tax owner action

Complete the [Texas sales tax permit process](https://comptroller.texas.gov/taxes/permit/) using the business's accurate legal and tax information. The official [permit FAQ](https://comptroller.texas.gov/taxes/sales/faq/permit.php) explains requirements. Do not paste personal taxpayer identifiers into chat. After registration, verify the correct jurisdiction and classification in Stripe and test the complete deposit-plus-balance tax calculation before enabling live checkout. [Texas taxable services](https://comptroller.texas.gov/taxes/publications/96-259.php) includes photography; final transaction treatment should be confirmed for the actual service and delivery model.
