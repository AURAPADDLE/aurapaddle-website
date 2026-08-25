# Production readiness gate

Live payment activation is blocked until every item is complete:

- Production container/backend is deployed with HTTPS and the managed PostgreSQL order store reports `storage: postgres` from `/api/health`.
- `PUBLIC_SITE_URL=https://www.aurapaddle.com`.
- A live Stripe restricted key is stored in the host secret manager.
- The production host uses `ALLOW_LIVE_PAYMENTS=true`, and startup/API checks confirm the configured key has an `rk_live_` prefix. Never store the key in this repository or in a browser bundle.
- `STRIPE_WEBHOOK_SECRET` is the live endpoint signing secret.
- A long random `ADMIN_API_TOKEN` is stored in the host secret manager and available only to Max/admin operations.
- Live webhook subscribes to Checkout completion, asynchronous payment success, charge refunds, invoice paid, invoice voided and invoice payment failed events.
- `GA4_API_SECRET` is stored only in the host secret manager, `/api/health` reports `analytics.configured: true`, and the durable analytics outbox has no failed entries.
- `ENHANCED_CONVERSIONS_ENABLED=false` remains enforced until a separate approval and Google user-provided data terms review.
- Stripe API version is `2026-06-24.dahlia`.
- Aura Paddle Pty Ltd is GST-registered and website prices are GST-inclusive. Before enabling Stripe Tax, configure the Australian registration and ensure Checkout and Invoice amounts use inclusive tax treatment so GST is not added on top of displayed prices.
- Initial payment, decline, 3DS, duplicate click, cancellation, full refund, balance invoice, balance payment and dispatch tracking are tested in sandbox.
- Backup and restore of the order store are tested.
- `ALLOW_LIVE_PAYMENTS=true` and `productionReady=true` in `stripe-config.js` are changed together only after the above checks.

The scheduled time does not override this safety gate.
