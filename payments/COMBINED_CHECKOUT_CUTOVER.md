# Combined checkout cutover checklist

This candidate remains local and default-off. The published storefront still tells shoppers to place in-stock and pre-order products in separate orders; do not enable the combined route until the approved policy and customer copy are updated in the same reviewed release.

## 16 November return-path review

- The isolated Stripe QA `404` was caused by its temporary success URL pointing to an API-only localhost harness. It was not a failure of the deployed single-mode success page.
- The candidate now has a dedicated combined confirmation page and server summary. Possession of the unguessable Checkout Session ID is the capability; the server also requires the ID to match the reserved request, Stripe metadata, currency and exact amount.
- A browser return never marks an order paid. `paid` requires both Stripe `payment_status=paid` and the durable signed-webhook order. Stripe-paid before webhook is shown as `confirming`; open, expired, missing and mismatched sessions remain non-paid.
- A paid refresh removes only the purchased quantities from the browser cart and records a local per-order marker so later refreshes cannot consume newly added items.
- This is still **no-go for production**: `server.mjs`, the production Stripe adapter and `cart-page.js` are not wired to the candidate; the public cart/policy still require separate orders; the real PostgreSQL test is skipped without the loopback test database; and the checked-in DB-IP manifest expired at `2026-11-16T00:00:00Z`, leaving the full suite red. Do not mask or waive those gates.

## Required before release

- Keep one parent Checkout Session and one payment due today; never create a Session for an unselected or second payment path.
- Resolve the current catalogue, dynamic sale availability, promotion and verified delivery quote immediately before reserving stock and creating the Session.
- Apply all parent, group, stock-hold and event-deduplication writes in one PostgreSQL transaction. Run the real PostgreSQL concurrency and restart suite against the release schema.
- Configure a separate Stripe sandbox webhook destination for the candidate endpoint and verify Stripe-signed raw-body delivery, replay and failure responses before any production cutover. Do not use `stripe trigger checkout.session.completed` for this check because it creates additional Stripe API objects.
- Keep provider recovery disabled for the first release. An ambiguous Session-create result must retain its hold until provider status is authoritative.
- Confirm each group independently records product paid today, shipping paid today, remaining product balance, later shipping status and fulfilment status. Accessories must not count toward a board campaign target.
- Preserve manual-quote and unavailable-stock failures. Rack-only remains quote-only; a paired Angler rack shares the board's later freight and exact 50% product split.
- Update the approved checkout, preorder, shipping and refund wording together. Do not publish code while public terms still require separate orders.
- Verify customer/admin email content, GA4 purchase total, refund review, invoice/balance collection and split dispatch against one parent payment without sending production messages or events.

## Release and rollback

- Release behind a default-off server feature flag with a database backup and the prior production commit recorded.
- Smoke-test single-stock, single-preorder, mixed stock/preorder, paired Angler rack, paid/free/manual shipping and duplicate webhook delivery in the sandbox.
- Enable only after the deployed SHA, schema and webhook destination all match the reviewed release.
- Roll back by disabling the flag first. Preserve paid parent/group records and stock holds; never delete or recreate an uncertain payment during rollback.
