# AURA no-minimum pre-order candidate

Status: local review candidate only. Not pushed or deployed.

## New-order behaviour

- Every currently priced pre-order SKU with a campaign uses `preorder-no-minimum-v1`.
- A successful 50% initial payment starts that order's production allocation. No shared target or public progress counter applies.
- Estimated dispatch is shown as approximately 10 weeks after successful initial payment. This is a review parameter and an estimate, not a guarantee.
- The remaining 50% and confirmed shipping remain a separate, non-automatic payment before dispatch.
- Prices, incentives, shipping rates, delivery regions, stock, analytics and Stripe account settings are unchanged.

## Historical protection

- Regular checkout freezes a versioned pre-order terms snapshot before redirecting to payment and copies it to the paid order.
- Combined checkout freezes the same snapshot at item and fulfilment-group level.
- Email dispatch estimates prefer the saved order snapshot instead of the current catalogue.
- Orders without a snapshot are treated as legacy target-based orders. Historical Paddle 50, Wake/Foil 5 and Surf/Commercial 10 progress can still be reconstructed for backend history.
- Existing payment, refund, balance and webhook handlers accept both legacy and new records. There is no data migration and no rewrite of existing paid orders or confirmed quotes.

## Public changes in the candidate

- Removes homepage and shop progress polling and visible target counters.
- Product pages, shop, Support pre-order explainer and policies describe the no-minimum, payment-triggered model.
- Existing order protection is stated explicitly in Support and policy copy.
- Structured product data retains the owner-confirmed `validFrom` date for current pre-order offers. A rolling per-order estimated availability date is not invented for Merchant Center.

## Switch and rollback

The switch is a normal code release; no environment or Stripe setting is required. Before release, compare the production SHA, run the full dependency-backed suite and verify desktop/mobile pages plus ordinary and combined checkout in an isolated environment.

Rollback can restore the prior code for new carts. Paid orders created under `preorder-no-minimum-v1` remain safe because their terms snapshot stays in the order record and the compatibility code must remain available. Do not roll back by deleting or rewriting order records, historical progress, payment callbacks or fulfilment groups.

## Still awaiting business review

- Confirm the public wording and the approximately-10-week parameter.
- Shipping scope and finished-product rate changes are intentionally excluded and remain undecided.
- The complete repository suite could not run in this isolated worktree because optional `pg` and `maxmind` packages are not installed here. The focused checkout, catalogue, combined-order, legacy/refund and public-copy suite passed.
