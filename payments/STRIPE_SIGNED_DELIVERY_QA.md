# Stripe signed delivery QA — 16 November 2026

- Environment: independent Stripe sandbox `acct_1U1HMPR8v0GjS5xa`
- CLI identity gate: authenticated; test credential available; live credential unavailable
- API mode: `livemode=false`
- Listener: official Stripe CLI 1.45.2, API version `2026-07-29.dahlia`
- Destination: loopback-only `127.0.0.1`; no public endpoint or shared webhook destination
- Trigger: exactly one official `checkout.session.completed` fixture
- Event: `evt_1UcF97R8v0GjS5xaAdiFNFeq`
- Synthetic Checkout: `cs_test_a0ndIhVskmr1RlmP6XU856jnZsWkGcEmLcjoqNPCk1YstyG6yA5CvOmYf6`, complete/paid, USD 30.00
- Receiver result: Stripe signature valid; raw-body request accepted; HTTP 200 returned

The official fixture did not include `aura_combined_request`, so it was intentionally not applied to the local combined-order ledger. This run proves Stripe-to-loopback delivery and signature verification only. It does not prove automatic mapping, group persistence or event replay for an AURA combined order. Those behaviours remain covered by the isolated local tests, including missing/invalid/stale signature rejection and duplicate-event idempotency.

No customer data, email, production credential, live payment, public ingress, shared Stripe configuration, website deployment or notification was used. The listener and receiver were stopped and the temporary CLI credential/configuration was deleted after verification.
