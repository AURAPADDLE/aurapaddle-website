# AURA PADDLE order and remaining-balance operations

## Launch and ownership

- Scheduled public launch: **18 August 2026, 01:18 Australia/Brisbane (AEST)**.
- Live Stripe may be enabled at that time only after the production readiness gate in `PRODUCTION_READINESS.md` is complete.
- `admin@aurapaddle.com` owns remaining-balance notices.
- For the first 12 weeks after launch, Max manually reviews every amount and triggers every balance invoice. The calculation, invoice creation and status updates are automated after that approval.

## Order identity and source fields

Every initial Checkout is assigned an `APO` order number plus five random digits, for example `APO48217`. The identifier is written to Checkout Session and PaymentIntent metadata as `aura_order_number` and becomes the business key shown to the customer.

The amount due later is read from the verified initial-payment order record:

- `amountTotal`: the 50% initial product payment already received. For the current pre-order model, the remaining product balance equals this amount.
- `shippingAmount`: the trusted shipping amount calculated from `shipping-rates.json` at initial checkout.
- `shippingQuoteRequired`: if true, Max must enter the confirmed freight amount before sending the invoice.
- `customerId`: the Stripe Customer created by the initial Checkout.
- `items`: the paid SKUs and quantities, used for reconciliation and production counts.

The balance invoice amount is `amountTotal + shippingAmount`. No amount is accepted from the browser checkout or customer-facing order page.

## Remaining-balance request

The normal request window is within six weeks after order confirmation. Max reviews the production position, customer, SKUs, quantities, destination and confirmed freight, then calls the protected `POST /api/admin/request-balance` operation. The server creates and emails a Stripe Invoice with a 14-day due date. Repeating the same request uses Stripe idempotency keys based on the APO order number.

The Stripe `invoice.paid` webhook changes the order from `balance_requested` to `balance_paid` and `preparing_for_dispatch`. Max does not manually mark an invoice paid.

## Customer-visible statuses

- `initial_payment_received`: verified 50% initial payment received.
- `balance_requested`: Stripe Invoice sent; payment pending.
- `balance_paid`: Stripe confirms the remaining product balance and shipping have been paid.
- `cancelled`: order cancelled by AURA PADDLE operations.
- `refunded`: Stripe confirms the initial payment was fully refunded.
- `dispatched`: Max records dispatch after carrier handover.

Customers use `/order/` with the secure order number and tracking token. From the dispatch date, the page displays an allowance of up to four weeks for delivery, depending on destination and carrier. This is a delivery window, not a guaranteed arrival date.

## First 12-week manual control

Max reviews the order list at least once per business day, checks balance reminders manually, and records cancellation or dispatch through the protected admin operation. Automation must not send reminder emails or change fulfilment state without this review during the first 12 weeks.
