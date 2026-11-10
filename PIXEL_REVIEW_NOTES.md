# Meta Pixel and browser-storage review notes

Prepared on branch `agent/production-payment-infrastructure` at `87aebcec53932f487e2604083170d972d0a530e4`. This patch is for offline review only and does not activate a production Pixel.

## Geographic default gate

The code accepts an Australian default only from a same-origin server result backed by the verified local DB-IP database and a strictly trusted Render client-IP boundary. The trust boundary remains disabled until the actual AURA production entry is verified and `TRUST_RENDER_CF_CONNECTING_IP=true` is deliberately configured, so the production-safe result of this undeployed patch is **off by default**. Language, timezone, URL parameters, shipping selection and arbitrary request headers are not used. A saved `marketing:false` is never upgraded. The unsaved Australian default remains distinguishable as `metaChoice:"default_au"` and is not labelled explicit consent.

### Hosting/proxy findings

The reviewed application is a Node HTTP server that serves the static site and payment APIs. Production documentation names `https://www.aurapaddle.com` and the code recognises Render through the `RENDER` environment variable, but the repository contains no Render blueprint, DNS/proxy configuration or provider-generated country header. The only proxy-derived value currently consumed is the first `x-forwarded-for` address, and only for review-submission throttling. Treating `x-forwarded-for` itself—or a country header supplied directly by an arbitrary client—as a trusted geographic decision would be unsafe.

The local draft now includes DB-IP Country Lite October 2026 in MMDB format, read only by the AURA server. The downloaded database's published MD5 and SHA-1 checksums were verified, an additional SHA-256 is pinned in the manifest, and any missing, malformed, checksum-mismatched or expired database fails to `UNKNOWN`. The current manifest expires at 16 November 2026 unless deliberately replaced with a newly verified monthly release. DB-IP publishes the Lite database under CC BY 4.0 and requires a DB-IP link on web pages using the result; the draft adds the DB-IP and licence links without loading a remote component. Visitor IPs are not sent to DB-IP.

The Render trust boundary is deliberately opt-in: both `RENDER=true` and `TRUST_RENDER_CF_CONNECTING_IP=true` are required, and only one syntactically valid public address from `CF-Connecting-IP` is accepted. `X-Forwarded-For`, socket addresses, multiple values, private/reserved addresses and unverified country headers are never fallbacks. Render's current documentation says Cloudflare overwrites `CF-Connecting-IP` for public web services and that the bound application port is not directly public, but the actual AURA production service/custom-domain route remains unverified. Until that check and explicit environment opt-in happen, every lookup is `UNKNOWN` and the Meta default remains off. VPNs and proxies can still cause an incorrect country result.

### Public-entry evidence checked 20 October 2026

- The connected GitHub repository metadata confirms `AURAPADDLE/aurapaddle-website` is public, its default branch is `main`, and `agent/production-payment-infrastructure` exists. Commit `87aebcec53932f487e2604083170d972d0a530e4` resolves on GitHub. This does **not** prove which branch Render currently deploys.
- Public DNS currently resolves `www.aurapaddle.com` by CNAME to `aura-paddle-storefront.onrender.com`, then to Render/Cloudflare infrastructure. The apex `aurapaddle.com` resolves to Render anycast addresses and returns a 301 to `https://www.aurapaddle.com/`.
- Both `https://www.aurapaddle.com/api/health` and `https://aura-paddle-storefront.onrender.com/api/health` returned the same live-enabled PostgreSQL-backed application state. This confirms an active dynamic Render origin is exposed through both hostnames; the `onrender.com` hostname is therefore an enabled alternative public entry, not merely a DNS target.
- Responses for `www` and the `onrender.com` hostname included Cloudflare and Render origin headers, consistent with Render's documented public Web Service path. These public observations do not prove what `CF-Connecting-IP` the Node process actually receives or that every possible production ingress overwrites a caller-supplied value.
- No connected Render administrative metadata tool was available, and repository files contain no `render.yaml`. Therefore the Render Dashboard remains authoritative for service type, linked branch, complete custom-domain list, redirects and whether any additional domains are enabled.

The trust switch remains off. Proving header overwrite requires a separately approved temporary deployment or an equivalent Render-side diagnostic. The minimal test is an admin-authenticated, `no-store` diagnostic that runs only for controlled requests and reports whether one valid public `CF-Connecting-IP` was received plus a one-way hash (not the raw IP). Send controlled requests to both `www` and the `onrender.com` host while attempting to supply a known fake `CF-Connecting-IP`; confirm the application-observed hash is not the fake value and is consistent with the controlled client's actual public IP. Remove the diagnostic before enabling the trust switch. DNS and response headers alone are insufficient.

## Existing storage and recipients

| Item | Purpose / recipient | Before choice | After permission | Retention found in code |
|---|---|---|---|---|
| `aura-cart-v2` localStorage | Necessary cart state; AURA website | Used | Used | No automatic expiry found |
| `aura-cookie-consent-v1` localStorage | Remember privacy choice; AURA website | Absent | Stored until cleared/replaced | No automatic expiry found |
| `aura-attribution-v1` localStorage | Campaign/referrer and permitted Google click IDs; AURA/Google measurement pipeline | Removed when both categories denied | Stored only for permitted categories | 90 days |
| Google tag / GA4 `G-0DJKT6VHVL` | Analytics; Google | The current Advanced Consent Mode loads the tag and can send cookieless denied-state requests | Additional identifiers/storage according to Analytics and Marketing settings | Google-side retention not specified in repository |
| Google Fonts | Font delivery; Google | CSS/font requests can occur on page load independently of Cookie Settings | Same | Browser/cache and Google-side retention not specified in repository |
| Google advertising click IDs (`gclid`, `gbraid`, `wbraid`, `gad_source`) | Campaign measurement; AURA/Google | Not retained by AURA when Marketing is denied | May be retained in consented attribution and passed in Stripe metadata for reconciliation | Up to 90 days in AURA attribution storage |
| Stripe Checkout and own checkout API | Payments; Stripe/AURA | No payment request until the visitor starts checkout | Checkout/session, order, delivery and payment status processed as necessary for the transaction | Order/accounting retention is described only as reasonably necessary; no fixed code expiry for paid orders |
| Formspree forms | Contact/newsletter delivery; Formspree | No form submission request until the visitor submits | Submitted form fields are sent to Formspree | Provider-side retention not specified in repository |
| AgentMail | Recovery and transactional email; AgentMail | No request from ordinary browsing | Recovery only after its separate opt-in; paid-order service email is transaction-required | Incomplete-checkout operational records 30 days; suppression hash may be longer; provider retention not specified |
| Cart shipping region sessionStorage | Checkout convenience; AURA website | As selected | As selected | Browser tab/session |
| Admin tokens sessionStorage | Internal admin pages; AURA website | Only on admin use | Only on admin use | Browser tab/session |
| Proposed `_fbp` / `_fbc` | Meta advertising measurement | Not created by this patch without eligibility | May be created after eligible Marketing state | Meta/account-side retention requires separate verification |
| Proposed one-time purchase receipt sessionStorage | Opaque first-party handoff to a clean confirmation page | Not present | Issued only to the checkout browser after a persisted paid webhook order; contains no order/session/customer data and is removed before redemption | 10-minute server expiry; browser tab/session |

The current banner previously said optional technologies “stay off” before choice. That was too broad because the source deliberately loads Google Advanced Consent Mode and may send denied-state cookieless requests. The draft now says optional cookies and storage remain denied and separately discloses limited cookieless Google measurement. GA4 runtime behaviour was not changed.

No separate Google Ads destination/configuration tag was found in the reviewed browser code. Marketing consent currently changes Google consent signals and permits approved Google click-ID retention, but this review does not infer that Google Ads conversion delivery is configured. That account-side state requires separate verification.

Analytics permission, Marketing/ad storage, ad user data and ad personalisation should not be collapsed into a single legal claim. The existing UI retains separate Analytics and Marketing switches. Current Google consent calls still map Marketing to `ad_storage`, `ad_user_data` and `ad_personalization`; this patch does not change that GA4/Google Ads behaviour and it needs a separate policy/legal review, especially for EEA, UK and Switzerland visitors.

## Pixel implementation boundaries

- Pixel ID: `972813395892993`.
- Code explicitly disables Meta automatic configuration with `fbq("set","autoConfig",false,...)` and sends only PageView, ViewContent, AddToCart, InitiateCheckout and verified Purchase.
- This code cannot prove the corresponding Meta Events Manager settings are disabled. Advanced Matching, Automatic Events, automatic detailed page data, CAPI and portfolio-wide automatic CAPI must be inspected separately.
- Sensitive/tokenised routes fail closed. Unknown query keys also fail closed. No Pixel script is injected on checkout success, order status, admin, API or recovery pages.
- Checkout creation sets a two-hour `HttpOnly; Secure; SameSite=Lax` binding cookie and stores only its SHA-256 hash with the reserved order. After Stripe reports paid, the sensitive success page can obtain a ten-minute opaque receipt only when the binding matches and the webhook-persisted order is paid and measurement-eligible. Session-ID knowledge alone is insufficient. Issuance and redemption require an exact same-origin `Origin`, are rate-limited, and return no order number, customer data, tracking token or Stripe identifier.
- The success response and HTML set `Referrer-Policy: no-referrer`. After receipt issuance, `location.replace('/purchase-confirmed.html')` performs a real navigation to a page with no query or fragment; it does not rely on `history.replaceState`. That page rejects any search, hash or referrer, atomically redeems the receipt with AURA first, and only then loads local Pixel code and the external Meta script. Meta therefore receives the clean confirmation URL, not the Stripe Session URL.
- Receipt redemption is atomic and single-use, closing the concurrent-tab race before any event payload is released. The browser also claims the stable event marker before queueing `fbq`. The deliberate contract is **at most once**, not exactly once: a lost redemption response or browser termination after redemption but before Meta accepts the request can lose a conversion. Retrying delivery after that boundary would reintroduce duplicate risk; guaranteed delivery would require a separately approved server-side/CAPI design.
- The success page retries receipt issuance for up to roughly ten seconds to cover normal webhook ordering. If the webhook is delayed beyond that, the browser Purchase can still be missed. CAPI remains disabled and out of scope.

## Before any launch

1. Confirm the actual Render/custom-domain proxy chain and add a documented, server-controlled Australian country signal; otherwise keep the default path off.
2. Verify current Meta terms and Google/Meta requirements for every served jurisdiction.
3. Review Meta account toggles and the business-portfolio automatic CAPI state.
4. Run the offline suite with Meta domains intercepted, then separately approve any Meta Test Events run.
5. Reconfirm the production branch/SHA and obtain deployment approval after the SEO observation window.
