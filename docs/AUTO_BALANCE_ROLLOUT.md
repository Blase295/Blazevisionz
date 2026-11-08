# Authorized automatic final-balance collection — staged rollout

Status: **DEVELOPMENT ONLY. NOT LIVE.** This branch does not authorize charges for existing customers. No live billing setting, product, invoice, saved-card permission, or Morgan Law Firm payment record has been changed.

## User-approved outcome
For **new future photography bookings only**, offer a preferred, optional card-on-file checkout:
1. Customer chooses whether to explicitly authorize future off-session payment. Consent is unchecked by default and stored with the booking and versioned terms.
2. Customer pays the **existing approved deposit** using Stripe Checkout. Only consenting bookings use `customer_creation=always` and `payment_intent_data.setup_future_usage=off_session`.
3. After deposit webhook verifies payment, the server verifies and stores only Stripe Customer and PaymentMethod identifiers (never card numbers).
4. Customer selects proofs; owner finishes gallery and explicitly clicks **Mark Gallery Ready + Email Charge Notice**.
5. Customer gets at least **24 hours' advance email notice** stating the remaining amount and how to contact the studio.
6. A gated scheduled Worker can attempt the **exact remaining service balance once**, off-session. It updates paid status only after a verified successful PaymentIntent; final gallery remains gated until full payment.
7. If charge fails, requires authentication, or has an unknown network result, halt automatic retries, notify the owner for Stripe reconciliation, and offer a **manual checkout only after double-charge risk is ruled out**.

If the customer did not opt in, the existing manual balance-payment link remains the only collection method. A booking started before the new policy defaults to manual.

**Price policy is unchanged.** Approved deposit tiers remain: under $200, 50%; $200–$500, $100; over $500, $200. For example, Essential $50/$50 and Signature $62.50/$62.50. Commercial projects still require a separate written quote and agreement; no automatic collection for historical outside-the-website projects.

## Safety gates and deployment
- `AUTO_BALANCE_ENABLED=false` in preview and production. Never enable in production until signed webhook and end-to-end sandbox validation passes.
- Current public checkout/payments launch flags are still false. This branch does not open public payments.
- New webhook events needed in the correct Stripe account (test endpoint first): `payment_intent.succeeded`, `payment_intent.payment_failed`. Preserve existing Checkout events.
- Review and publish customer-facing versioned consent terms, separate manual alternative, advance notice, amount, timing, failure handling, cancellation/refund rights, and privacy disclosures. Obtain appropriate legal review.
- Complete account-specific tax/payment launch review already listed in `docs/LAUNCH_POLICY_REVIEW.md`. This change is NOT a tax registration or exemption.
- Apply D1 migration 0007 on isolated preview first; legacy default `auto_balance_consent=0` must be verified. Never migrate production with a non-review branch.
- Perform full tests with Stripe test-mode Checkout using a consented test card, then declined and 3DS-required card scenarios; verify no second charge when webhook is replayed or cron runs again.
- Verify client notice receipt and 24-hour timing; verify no charge when notice not sent or consent absent.
- Confirm that a client who starts a manual balance Checkout cannot also receive a final automatic charge. The Worker currently escalates existing manual Checkout records to owner review.
- Verify an unknown Stripe API response does not retry automatically; owner must reconcile Stripe before any manual alternative.
- Test responsive booking and owner UI and the full delivery gate. Do not turn on live feature flags until these checks pass.
- Do not use this new flow to collect Morgan's separately agreed outstanding $375. His existing Stripe Payment Link remains unchanged.

## Implementation notes
- This branch changes booking consent, Stripe deposit Checkout setup, owner gallery-ready action, email notice, webhook verification, and a fail-closed Worker charge attempt.
- A booking-level claimed attempt prevents automatic retries after unknown Stripe outcomes. A fixed Stripe idempotency key additionally protects immediate retries; it does NOT replace reconciliation after Stripe's idempotency retention window.
- No edits to existing Stripe payment links, products, subscriptions, account settings, refunds, or stored payment methods.
