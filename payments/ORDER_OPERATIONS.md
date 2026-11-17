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

## Remaining-balance request and dual entry

The normal request window is within six weeks after order confirmation. Max opens `/admin/orders/`, reviews the production position, customer, SKUs, quantities, destination and confirmed freight, then confirms both of the following before the protected operation is available:

- the product is ready to proceed to dispatch after final payment;
- the delivery region and final shipping charge are correct.

For a published delivery region, the stored server-side freight amount is locked. For an order marked `quote_required`, Max enters the confirmed freight in the internal page. The browser sends the confirmation, but the server still calculates the final amount from the verified order record and the approved freight. The customer-facing page cannot create an invoice or change an amount.

The protected `POST /api/admin/request-balance` operation creates and emails a Stripe Invoice with a 14-day due date. Repeating a completed request returns the existing Stripe invoice instead of creating a second one. Stripe idempotency keys based on the APO order number protect an in-progress retry.

The customer has two routes to the same Stripe-hosted invoice:

1. the invoice email sent by Stripe;
2. the **Pay remaining balance securely** button on the customer's token-protected `/order/` page.

The second route only appears after Stripe has returned a valid hosted invoice URL. Both routes lead to the same invoice and payment status.

The Stripe `invoice.paid` webhook changes the order from `balance_requested` to `balance_paid` and `preparing_for_dispatch`. Max does not manually mark an invoice paid.

## Customer-visible statuses

- `initial_payment_received`: verified 50% initial payment received.
- `production_confirmed`: AURA PADDLE has confirmed the board for production or stock allocation.
- `balance_requested`: Stripe Invoice sent; payment pending.
- `balance_paid`: Stripe confirms the remaining product balance and shipping have been paid.
- `preparing_for_dispatch`: final payment is verified and the order is being prepared for the carrier.
- `cancelled`: order cancelled by AURA PADDLE operations.
- `refunded`: Stripe confirms the initial payment was fully refunded.
- `dispatched`: Max records the carrier, tracking number and optional secure tracking link after handover.
- `delivered`: Max records delivery after carrier confirmation.

Customers use `/order/` with the secure order number and tracking token. The page shows the seven-stage progress timeline, AURA's estimated dispatch date and, after handover, the carrier and tracking details. From the dispatch date, the page displays an allowance of up to four weeks for delivery, depending on destination and carrier. This is a delivery window, not a guaranteed arrival date.

The protected `/admin/orders/` page is the source of manual progress updates. It may update the estimated dispatch date, confirm production or stock allocation, record dispatch and mark delivery. Dispatch is blocked until Stripe has verified the final payment; carrier and tracking number are required. Customers cannot edit these fields.

Transactional customer emails are queued at three key events: final balance requested, final balance paid and dispatched. The same event key is sent at most once. Production-date and delivered updates appear on the secure status page but do not send an extra email in this first version.

## First 12-week manual control

Max reviews the order list at least once per business day, checks balance reminders manually, and records cancellation or dispatch through the protected admin operation. Automation must not send reminder emails or change fulfilment state without this review during the first 12 weeks.
