# AURA PADDLE GA4 measurement plan

## Authoritative payment events

Stripe webhooks are the source of truth for payment lifecycle events. The browser success page records only `payment_confirmation_view`; it does not emit a second `purchase`.

| Stripe event | GA4 event | Advertising use |
| --- | --- | --- |
| `checkout.session.completed` or `checkout.session.async_payment_succeeded` with paid status | `purchase` | Primary purchase; initial payment only |
| `charge.refunded` | `refund` | Revenue correction |
| `invoice.paid` | `balance_payment` | Analysis only; do not import as a Primary conversion |
| `invoice.voided` | `balance_invoice_voided` | Operations analysis |
| `invoice.payment_failed` | `balance_payment_failed` | Operations analysis |

The `purchase` transaction ID is the APO order number. Balance events use a separate `APOxxxxx-BALANCE` transaction reference so they cannot be mistaken for the initial purchase.

## Checkout funnel

Create a closed GA4 Funnel exploration with indirectly-followed steps:

1. `view_item_list`
2. `select_item`
3. `view_item`
4. `add_to_cart`
5. `view_cart`
6. `add_shipping_info`
7. `begin_checkout`
8. `purchase`

Recommended breakdowns: Session source / medium, Session campaign, Device category, Region, Item name and New / established users.

Create a second product-decision funnel:

1. `view_item`
2. `select_product_option`
3. `size_finder_complete`
4. `add_to_cart`
5. `begin_checkout`

## BigQuery

Start with Daily export only. Do not enable Streaming until AURA PADDLE separately approves the Google Cloud project, data location and potential charges.

Planned reporting views:

- `funnel_daily`
- `campaign_to_order`
- `product_performance`
- `time_to_purchase`
- `payment_lifecycle`

Do not export customer email, phone, tracking token or full delivery address as custom event parameters.

## Enhanced conversions readiness

The server supports SHA-256 hashing of eligible Stripe customer details but `ENHANCED_CONVERSIONS_ENABLED` must remain `false`. Enabling it later requires:

1. explicit AURA PADDLE approval;
2. acceptance of the Google user-provided data terms in GA4;
3. Marketing consent on the associated order;
4. verification that GA4 Purchase remains the only Primary Purchase source in Google Ads.
