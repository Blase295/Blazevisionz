# Blazevisionz / Blazing Visuals

Editorial photography website and private booking operations for Spring / Houston, Texas. The original HTML/CSS aesthetic is preserved; genuine photography placeholders remain until the owner supplies images.

**Website:** https://blazevisionz.blazevisionz.workers.dev

**Preview:** https://blazevisionz-preview.blazevisionz.workers.dev

**Booking is closed.** Stripe's separate Blaze Vizionz account currently shows Payments paused. No customer checkout, real charges, or subscriptions are enabled.

## Run locally

Use Node 24 or later.

```sh
npm ci
npm test
npm run build
npx wrangler d1 migrations apply blazevisionz-preview --local
npm run dev
```

Local simulation uses Cloudflare Pages Functions. Primary deployment uses a Worker with static assets, D1, rate limiting, signed Cloudflare Access owner authentication, and scheduled email/hold processing.

```sh
npx wrangler deploy --config wrangler.worker.jsonc --dry-run
npx wrangler deploy --config wrangler.worker.jsonc --env production --dry-run
npx wrangler types --config wrangler.worker.jsonc
node tools/verify-visual.mjs
node tools/verify-preview-api.mjs
```

Production and preview use separate databases and Access applications. Set API/email secrets only through Cloudflare secret bindings. Never put secrets in GitHub or the browser.

## Architecture

- Static site: `index.html`, `styles.css`, `script.js`.
- Owner scheduling: `admin.html`, `admin.js`.
- Private paid-client intake, consultation, balances, and image selections: `client.html`, `client.js`.
- API/payment validation: `src/api.mjs` and `src/domain.mjs`.
- Reminder/email outbox and reservation reconciliation: `src/operations.mjs`.
- Database constraints and migrations: `migrations/`.
- Worker entry: `src/worker.mjs`. Pages compatibility route: `functions/api/[[path]].js`.
- Build copies only selected public files, keeping source, documents, credentials, and databases out of static assets.

Essential: $100 / $30 deposit / $70 balance / 30 minutes / 3 JPEGs. Signature: $150 / $45 deposit / $105 balance / 60 minutes / 5 JPEGs. Extra edits: $20 each. No RAW files. Prices do not change automatically at session twenty.

## Automatic deployment

GitHub Actions checks pushes/PRs and deploys `main` to the production Worker after the repository secret `CLOUDFLARE_API_TOKEN` is configured. The workflow explicitly reports a blocked deployment when this secret is absent. Restrict the token to this Cloudflare account with Workers Scripts Edit and D1 Edit (migration access); do not expose it in source or chat.

Cloudflare's native Pages Git integration was attempted and rejected with `8000011` (internal Git installation issue). The deployed Workers use the authorized Cloudflare plugin API. To restore native Git integration, repair/reinstall the Cloudflare GitHub app and grant access only to `Blase295/Blazevisionz`. The provided Actions pipeline is an alternative; it does not require that app.

## Launch documentation

- [Studio operations and launch checks](docs/OPERATIONS.md)
- [Private client terms draft](docs/CLIENT_TERMS_DRAFT.md)
- [Stripe account and test product IDs](docs/STRIPE_SETUP.md)
- [Deployment, tests, and blockers](docs/COMPLETION_REPORT.md)

No B4US website/repository or Grailed account was modified. Only open real dates around security/family commitments after protecting two B4US work blocks weekly; initial cap is six sessions.
