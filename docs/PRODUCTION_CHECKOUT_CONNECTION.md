# Production checkout connection — October 21, 2026

The owner authorized dedicated production Stripe and transactional-email credentials, a signed production webhook, and encrypted Cloudflare storage. This is preparation for real checkout, not a claim that checkout is enabled.

## Installed

- `RESEND_API_KEY`: separate sending-only key named Blazevisionz production transactional, restricted to the existing verified `mail.blazevisionz.com` domain. Stored only as an encrypted production Worker secret. The preview credential remains separate.
- `TOKEN_ENCRYPTION_KEY`: independently generated production encryption key; stored as an encrypted Worker secret. No preview tokens or fixtures were copied.
- `STRIPE_WEBHOOK_SECRET`: production signing credential stored as an encrypted Worker secret.
- `EMAIL_FROM` and `CONTACT_EMAIL`: production sender and owner reply address are now declared in Worker configuration.
- Stripe destination `we_1UStJrCXm8prgzwssNAJMjcz`, named Blazevisionz production booking webhook, targets `https://blazevisionz.com/api/webhook`. Account scope only; snapshot API version `2026-09-30.endive`. Listens only to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`.

## Still pending

- The dedicated live Stripe key is prepared with only Checkout Sessions write and Accounts read. Stripe email verification succeeded, then Stripe required the owner's phone verification code. The key has not been released or installed yet.
- Live payment-method configuration, charge/payout eligibility, and production provider delivery still require verification after the live key is available.
- Production contains zero open shoot appointments. Owner input is required for real availability and workload limits; disposable preview fixtures are not a production schedule.
- Tax registration remains incomplete. No tax-completion or policy-approval flag has been set merely to make a button appear enabled.
- Public payment and sandbox gates remain false. No real charge or test charge was initiated in production.

The owner must enter Stripe's requested phone code directly in Edge. Do not send authentication codes or secret credentials in chat or commit them to GitHub.
