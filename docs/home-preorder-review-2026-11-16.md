# AURA homepage and preorder review — 16 November 2026

Status: local review candidate only. Nothing in this branch has been pushed or deployed.

## Homepage candidate

- Keeps the exact brand line: “Paddle out. Find your way on the water.”
- Keeps the current hero video and poster as placeholders. The proposed Photo A has not been substituted because the Drive file requires an authenticated re-verification and commercial-use approval is still pending.
- Moves Yoga Cruiser buying information out of the brand hero into a separate featured-board section.
- Preserves “Choose your water” and the existing `ranges`, `finder`, and `commercial` destinations.
- Adds the existing `/pre-order/` explainer to the Support menu without duplicating its rules on the homepage.
- Adds verified Facebook, Instagram, TikTok and WhatsApp text links with locally generated QR codes. Facebook points to `https://www.facebook.com/aurapaddleau/`.

Photo A should remain the original 8000×4512 image. The proposed treatment is CSS-only: a modest image-layer brightness/colour adjustment, a lighter overall overlay, and a local text-side gradient. It must not synthesize or alter the scene. An accessible local source file is required before that preview can be made.

## Current checkout catalogue

There are 78 checkout variants: 4 available and 74 preorder. Every current preorder entry still carries the existing threshold/MOQ model, so removing it requires coordinated catalogue, server, policy, admin and historical-order handling—not just hiding a progress bar.

| Family | Current checkout status | SKUs |
| --- | --- | --- |
| Yoga Cruiser | AP734955 available; 3 preorder | AP734955, AP505002, AP233694, AP587273 |
| Angler Fishing | 4 preorder | AP550986, AP246179, AP560103, AP912342 |
| Touring Performance | 4 preorder | AP881762, AP804412, AP511450, AP168023 |
| CoastGo | 3 available; must retain current shipping | AP081165, AP730047, AP388238 |
| Inflatable Hydrofoil Board | preorder; currently quote-only shipping | AP428330 |
| Hydrofoil Kit Set | preorder; currently quote-only shipping | AP246531 |
| Gannet | 24 preorder, 5'8–6'10 hard EPS | AP579723, AP074024, AP023909, AP946846, AP006579, AP664194, AP919973, AP554929, AP651051, AP469730, AP187862, AP751836, AP033381, AP966827, AP070849, AP788266, AP777052, AP000256, AP471027, AP338627, AP839236, AP732417, AP307472, AP319929 |
| Current | 9 preorder, 7'0–8'0 hard EPS | AP200288, AP011855, AP695811, AP963442, AP367651, AP925022, AP663112, AP558837, AP514602 |
| Meridian | 9 preorder, 9'0–9'6 hard EPS | AP665269, AP875178, AP038101, AP824369, AP951141, AP054037, AP641007, AP606027, AP043644 |
| Wayfinder | 18 preorder, 6'6–9'0 commercial softboard; quote-only | AP500687, AP606496, AP366317, AP946958, AP927466, AP559907, AP020612, AP739739, AP275308, AP397729, AP963612, AP982409, AP831252, AP579681, AP874598, AP332801, AP859327, AP199561 |
| Fishing Rack | preorder accessory; paired/standalone rules differ | AP667703 |

Vela Wakeboard AP829251 is a waitlist product without a confirmed checkout price and is not in the checkout catalogue.

## Current shipping and payment behaviour

- CoastGo keeps its present rules: selected standard regions, A$120 per-board Express where eligible, and manual quote for remote/ineligible destinations. Its three SKUs must not transfer a free-shipping benefit to other products in a mixed cart.
- The published `AURAFREESHIP` campaign currently runs through 30 November 2026 (Brisbane time), for the approved Yoga and CoastGo SKU/metro combinations. It must not be extended. A replacement rule should therefore not silently cut short the published campaign; the clean effective date is 1 December unless Max explicitly chooses another transition.
- Remote areas, islands, ambiguous addresses and existing quote-only families remain manual quote.
- Current ordinary stock checkout collects full product price and applicable shipping today.
- Current preorder checkout collects 50% today and the remaining 50% plus confirmed shipping before dispatch; there is no automatic later charge.
- Current mixed checkout collects one payment today for in-stock product/full applicable shipping plus preorder deposits. Preorder balance/shipping remains a later, separate obligation and fulfilment is grouped internally.
- Existing paid orders and quotes must retain their snapshotted terms. New effective-dated rules must never be read back into old orders.

## Decisions required before implementing commercial rules

1. Define “inflatable board”: whether the A$50 proposal covers only Yoga/Angler/Touring iSUPs, and explicitly decide AP428330. CoastGo is already excluded from the new rule; AP246531 is a kit rather than a board.
2. Confirm surfboard classes. The data suggests Gannet=short, Current=mid and Meridian=long, but Max must confirm the actual model/length boundary. Wayfinder softboards cannot be assumed excluded or included; their commercial quote-only path must remain until decided.
3. Confirm the A$50 and A$150/A$200/A$250 amounts are per board, GST treatment, and whether freight is locked at initial payment or reconfirmed before preorder dispatch.
4. Confirm multi-board treatment, pickup, paired Fishing Rack, and mixed CoastGo/new-rule carts. Remote/island/ambiguous addresses remain quote-only.
5. Define “10 weeks”: calendar weeks from successful initial payment, estimated dispatch rather than delivery, and what happens if availability or address approval is delayed. It must not rewrite existing contracts.
6. Confirm rollout timing relative to the published free-shipping end date.

## Minimum safe implementation after approval

1. Add effective-dated product-class shipping and preorder terms to the generator/catalogue and server validation; preserve order snapshots.
2. Remove MOQ/progress semantics from new preorder checkout, product pages, homepage, `/pre-order/`, policies, admin and balance workflows together.
3. Keep old-order rendering and balance/refund paths on their recorded terms.
4. Test all product families, mixed carts, remote/manual quote, CoastGo isolation, campaign boundary, existing-order fixtures and mobile/desktop UI before any deployment.

