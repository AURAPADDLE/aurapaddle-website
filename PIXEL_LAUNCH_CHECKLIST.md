# Meta Pixel launch checklist

Prepared for review only. Nothing in this checklist authorises deployment or changes a production, Render, DNS, GitHub or Meta setting.

## Verified locally

- [x] Draft is based on `agent/production-payment-infrastructure` at `87aebcec53932f487e2604083170d972d0a530e4`, not an assumption that `main` is production.
- [x] Pixel remains absent until explicit Marketing permission or an eligible unsaved AU default.
- [x] Saved rejection and withdrawal override the AU default; notice dismissal changes only the current tab-session UI state.
- [x] Public-page/query allowlist excludes admin, order, recovery, identity and sensitive checkout URLs.
- [x] PageView, ViewContent, AddToCart and InitiateCheckout payloads are minimised.
- [x] Purchase requires a webhook-persisted paid order, browser-bound short-lived receipt, clean no-referrer confirmation page and atomic one-time redemption.
- [x] Advanced Matching, automatic events, detailed page data and CAPI are not enabled by draft code.
- [x] DB-IP Country Lite October 2026 checksums match the official release; local lookups return only AU, OTHER or UNKNOWN and fail closed after 16 November 2026.
- [x] `/api/region` is same-origin and returns both `Cache-Control: no-store` and `CDN-Cache-Control: no-store`.
- [x] DB-IP and CC BY 4.0 attribution links are prepared without a remote component.
- [x] Full local suite passed 169 tests with no Meta, Google, Stripe or other third-party event delivery.

## Public production evidence verified read-only

- [x] `aurapaddle.com` currently redirects to `https://www.aurapaddle.com/`.
- [x] `www.aurapaddle.com` currently CNAMEs to `aura-paddle-storefront.onrender.com`.
- [x] Both `www` and `aura-paddle-storefront.onrender.com` reach the same live-enabled PostgreSQL-backed health response.
- [x] The `onrender.com` hostname is an active alternative public entry.
- [x] Public responses are consistent with Cloudflare in front of a Render origin.

## Must be verified before deployment

- [ ] In Render Dashboard, record the service ID/name, service type, linked repository, deployed branch, current commit, all custom domains and redirect/canonical-domain settings. Confirm no unreviewed alternate ingress exists.
- [ ] Confirm whether `aura-paddle-storefront.onrender.com` should remain directly public after launch; if retained, include it in controlled header tests and ensure canonical URLs still point to `www`.
- [ ] Prove inside the Node process that Render overwrites a spoofed `CF-Connecting-IP` on both public hostnames. Use a temporary protected/no-store diagnostic under separate deployment approval; DNS and public response headers are not sufficient.
- [ ] Keep `TRUST_RENDER_CF_CONNECTING_IP=false` until that test passes. Do not add an XFF or socket-address fallback.
- [ ] Add the verified MMDB provisioning/update step to the actual Render build, then confirm `/api/health` reports `geoRegion.database: ready` before enabling trust.
- [ ] Establish a monthly database replacement owner and an alert before `validUntil`; expired data must stay fail-closed.
- [ ] Reconfirm the exact production branch/SHA after the SEO observation period and rerun the full offline suite against it.
- [ ] Review desktop/mobile notice and detailed-settings UI on the actual production build with Meta domains blocked.

## Meta Events Manager — user screenshot/read-only check

- [ ] Dataset `972813395892993` → Settings: Automatic Advanced Matching is off.
- [ ] Settings: automatic/no-code events are off.
- [ ] Settings: automatic detailed page/product data is off.
- [ ] Settings: Conversions API and portfolio-wide automatic CAPI are not connected/enabled.
- [ ] Record any account-level traffic permissions or data-use settings that could expand collection beyond the five approved events.
- [ ] Do not expose access tokens, test-event codes, partner credentials or other secrets in screenshots.

## Separate approvals still required

- [ ] Approve the final privacy wording and DB-IP attribution placement; this technical draft is not a legal compliance opinion.
- [ ] Choose browser Purchase at-most-once semantics or separately approve a CAPI design for stronger delivery guarantees.
- [ ] Approve a Meta Test Events session, if desired; until then all tests continue to intercept/block Meta.
- [ ] Approve the final deployment time after the SEO observation window.
