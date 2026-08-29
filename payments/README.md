# AURA PADDLE Stripe sandbox integration

This folder contains the server-side portion of the Stripe Checkout review build. The public website remains static, but payment creation and webhook verification run here so that no Stripe secret is exposed in HTML, JavaScript or GitHub.

## Current safety state

- Sandbox/test payments only.
- Live keys are rejected unless `ALLOW_LIVE_PAYMENTS=true` is deliberately configured later.
- Dynamic payment methods are enabled; Afterpay is explicitly excluded.
- The browser submits only an AP SKU and quantity. `catalog.json` supplies the trusted AUD amount.
- The existing 76 enabled board SKUs have persistent Product objects in the original review sandbox. When `STRIPE_ACCOUNT_ID` identifies a different Stripe account, the server deliberately ignores those account-bound IDs and creates trusted inline product data from the local catalogue instead. This keeps every amount and SKU server-controlled while preventing cross-account Product ID failures.
- Hydrofoil Set (AP246531) uses server-validated inline Stripe product data until a persistent sandbox Product is created. Its amount still comes only from the trusted local catalogue, never from browser input.
- 77 priced board SKUs plus the Fishing Rack accessory are enabled. Vela is excluded because its RRP is not confirmed in the current website data.
- Eligible board pre-orders apply the approved AUD 50 incentive first and then collect exactly 50% of the reduced pre-order price. Fishing Rack checkout uses its applicable catalogue or bundle price and collects 50% when ordered.
- Checkout requires one of the approved Australian delivery regions. The trusted server recalculates the iSUP or hard-surfboard rate, records the region and shipping amount in Stripe metadata, and collects an Australian delivery address unless Gold Coast local pickup is selected.
- Shipping is not charged with the initial 50% product payment. The remaining 50% and the recorded shipping amount are requested through a separate secure Stripe payment request before dispatch; the original payment method is not charged automatically.
- `shipping-rates.json` is the server-side source of truth for the published regional rates, Gold Coast pickup wording, AUD 50 longboard surcharge and quote-required rules. The cart mirrors these values for immediate display, while the server remains authoritative against browser tampering.

## Local setup

1. Copy `.env.example` to a secure local `.env` file, or export the variables directly in Terminal. Never commit the key.
2. Use a Stripe sandbox restricted key if possible. A sandbox secret key also works for local review.
3. Run `node payments/server.mjs` from the `website` directory.
4. Open `http://localhost:4242/products/yoga-cruiser.html`.
5. For webhook testing, use the Stripe CLI to forward events to `http://localhost:4242/api/stripe-webhook` and copy its `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

The server also exposes:

- `GET /api/health`
- `POST /api/checkout`
- `GET /api/checkout-session?id=...`
- `POST /api/stripe-webhook`
- `GET /api/preorder-progress`
- `GET /api/admin/abandoned-checkouts` (Bearer `ADMIN_API_TOKEN` required)
- `GET /api/recovery/unsubscribe?token=...`

## Consented abandoned-checkout recovery

- Stripe Checkout Sessions expire after two hours and have Stripe recovery URLs enabled for 30 days.
- The cart offers a default-off recovery-email checkbox before redirecting to Stripe. The server copies that explicit choice into Checkout metadata and queues one recovery email only when the customer selected it, an email is present and Stripe supplied a recovery URL.
- Recovery sends use a durable outbox, AgentMail idempotency keys, retry backoff, a seven-day same-recipient deduplication window and a one-click suppression link. `AGENTMAIL_AGENTMAIL_API_KEY` is injected by Stripe Projects and never exposed to the browser.
- The protected internal view is `/admin/abandoned-checkouts/`. Its token is held in `sessionStorage` for the current browser tab only. No SMS provider, SMS queue or SMS action is configured.
- Abandoned checkout and sent-email operational records are retained for 30 days. Email suppression hashes are retained so an unsubscribe choice continues to be honoured.

## Paid-order email confirmation and internal notification

- A verified paid Checkout webhook queues two transactional emails: an order confirmation to the customer and an immediate new-order notification to `ORDER_NOTIFICATION_EMAIL` (default `admin@aurapaddle.com`).
- The customer confirmation includes the APO order number, selected items, initial payment, remaining product balance, delivery arrangement, current estimated dispatch and secure order-status link.
- The internal notification includes the customer contact details, order and payment summary, delivery arrangement, estimated dispatch, secure order-status link and Stripe payment link.
- These emails use a durable outbox, independent AgentMail idempotency keys and exponential retry backoff. Replayed Stripe webhooks fill a missing queue entry without duplicating a sent message.
- They are service emails generated by a completed payment and do not depend on marketing or abandoned-checkout consent. SMS notifications remain disabled.

## Consent-aware attribution and GA4

- The browser records first- and last-touch campaign data only after the relevant optional consent is granted. Analytics consent covers UTM/referrer/landing data; Marketing consent covers Google ad-click identifiers (`gclid`, `gbraid`, `wbraid` and `gad_source`).
- Attribution expires after 90 days, is attached to the reserved APO order, and is copied into Stripe metadata so the webhook can reconcile the order without trusting browser-supplied prices.
- Stripe webhooks are authoritative for `purchase`, `refund`, remaining-balance payment and balance failure/void events. The browser success page emits only `payment_confirmation_view` to avoid duplicate purchases.
- Server events are queued in the durable order store before delivery to GA4 and retried with backoff. `/api/health` reports whether GA4 is configured and the pending/failed outbox counts without exposing the API secret.
- Configure `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` and `GA4_SERVER_EVENTS_ENABLED=true` in the host secret manager. Keep `GA4_VALIDATION_MODE=false` in production.
- `ENHANCED_CONVERSIONS_ENABLED` must remain `false` until a separately approved launch. No contact detail is hashed or sent while it is disabled.

See `GA4_MEASUREMENT_PLAN.md` for the event ownership, funnel steps and BigQuery rollout gate.

## Before any live launch

- Reconfirm the published regional freight rates against the production carrier account, then configure the separate remaining-balance payment request or invoice template to use the Stripe shipping metadata.
- Confirm GST/tax invoice settings in Stripe.
- Choose and provision the production backend host; GitHub Pages cannot hold secret keys or receive webhooks.
- Replace the local JSON webhook store with durable production storage.
- Configure a production webhook and restricted API key in the backend secret manager.
- Run initial-payment success, decline, 3DS, cancellation, duplicate-click, full-refund, partial-refund and remaining-balance payment tests.
- Obtain explicit deployment approval before enabling a live Stripe key.
