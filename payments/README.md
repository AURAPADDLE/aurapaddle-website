# AURA PADDLE Stripe sandbox integration

This folder contains the server-side portion of the Stripe Checkout review build. The public website remains static, but payment creation and webhook verification run here so that no Stripe secret is exposed in HTML, JavaScript or GitHub.

## Current safety state

- Sandbox/test payments only.
- Live keys are rejected unless `ALLOW_LIVE_PAYMENTS=true` is deliberately configured later.
- Dynamic payment methods are enabled; Afterpay is explicitly excluded.
- The browser submits only an AP SKU and quantity. `catalog.json` supplies the trusted AUD amount.
- The existing 76 enabled board SKUs have persistent sandbox Product objects. The checkout service creates trusted 50% initial-payment line items from the local catalogue while `stripe-sandbox-map.json` supplies the corresponding sandbox Product IDs without storing credentials.
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

## Before any live launch

- Reconfirm the published regional freight rates against the production carrier account, then configure the separate remaining-balance payment request or invoice template to use the Stripe shipping metadata.
- Confirm GST/tax invoice settings in Stripe.
- Choose and provision the production backend host; GitHub Pages cannot hold secret keys or receive webhooks.
- Replace the local JSON webhook store with durable production storage.
- Configure a production webhook and restricted API key in the backend secret manager.
- Run initial-payment success, decline, 3DS, cancellation, duplicate-click, full-refund, partial-refund and remaining-balance payment tests.
- Obtain explicit deployment approval before enabling a live Stripe key.
