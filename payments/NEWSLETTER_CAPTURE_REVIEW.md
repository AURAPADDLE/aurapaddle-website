# Newsletter capture and published-update integration (isolated review)

## Source / baseline
This builds on the independently reviewed phase-one ledger commit f50938f and merges the production policy commit ea12b2f. No policy files are changed by this feature. No production data was imported. No production deployment, service configuration, paid service or email sending has occurred.

The existing homepage sends newsletter and contact enquiries to the same Formspree endpoint `xaqrowoy`. The inspected free Formspree setup has admin notification email, but no enabled webhook/marketing integration. Therefore this implementation does not depend on a paid API or quietly create a new processor.

## First-party capture, when enabled
Enable only after deployment approval and a state backup/restore check:
- `NEWSLETTER_ADMIN_ENABLED=true`
- `NEWSLETTER_CAPTURE_ENABLED=true`

The server renders the homepage newsletter form with same-origin `/api/newsletter/subscribe`, a unique request ID and the current consent version. HTML is no-store. Contact enquiries are untouched and still use Formspree. Without the feature flag, the original newsletter Formspree action is retained. There is never a fallback dual write after an uncertain first-party result.

The endpoint checks exact Origin, content type, bounded body, explicit checkbox choice, consent version, request ID, email validity and honeypot. Only the current server-authored consent wording is stored, with original address and server capture time. JSON and ordinary form submissions work. It responds after database persistence succeeds. Duplicate request retries do not change the original record/time; responses do not reveal whether an address is already subscribed or suppressed.

Public signups are `pending_review`, because an unchecked-by-default checkbox proves a submission, not email ownership. They are excluded from candidate sending lists. Existing suppression is never removed. There is no double-opt-in email, welcome email, marketing email or admin-notification email. This changes new newsletter notification from the Formspree inbox to the private admin ledger when enabled; no contact enquiry notifications are changed. Verified historical records can still be recorded by the protected evidence workflow.

The abuse limiter is per server process (global 500/hour, IP 30/hour, normalized email 5/hour). It stores ephemeral keyed hashes and counters, not raw IPs/emails, and expires buckets. This is a bounded initial defense, not CAPTCHA or distributed bot protection. Confirm production proxy trust and instance count before enabling. Multiple replicas/restarts require shared/edge rate limiting if stronger abuse resistance is needed. No CAPTCHA service or cost is introduced.

## Meaningful website updates to drafts
`NEWSLETTER_UPDATES_ENABLED=true` enables a startup and once-per-minute manifest sync. The repository file `payments/newsletter-updates.json` is deliberately empty until an intentional publishable update is authored. It is not served publicly. `NEWSLETTER_UPDATES_PATH` can point to a local fixture for testing.

An entry must explicitly set `newsletter: true`, `status: published`, a unique sourceId/version, title, verified summary, kind (`website_update` or `promotion`), HTTPS AURA URL and publishedAt. Promotions additionally need expiresAt. Future or expired entries do not generate new drafts. Ordinary deploys, typo fixes, policy changes and entries not marked for newsletter do nothing. Repeated deployments/ticks are idempotent. Changed content or timing requires a new version. The batch validates before any write. Previously generated drafts become `expired` or `withdrawn_or_superseded` when appropriate. All remain unsent audit records.

This is explicit content-release integration, not a crawler or an AI that guesses every website change. To use it, the website release author adds the meaningful update entry as part of the release; the service then creates the draft and candidate snapshot automatically. Review must still approve the facts and audience before any future sending system could act. No sending system is included here.

## Verification and limits
- Newsletter automated coverage: 38/38 passing (unit, local HTTP, frontend script race/error/retry tests).
- Full suite: 217 tests, 216 passing; existing unchanged Geo-IP test fails because the isolated checkout lacks its untracked MMDB data file.
- Tested enabled/disabled paths, persisted pending consent, exact wording/version, duplicate retry, honeypot, missing checkbox, invalid origin, no-JS form, admin access, no public PII, no outbox changes, contact Formspree preservation, release idempotency/atomicity/expiry, network failure without fallback, repeated clicks and existing phase-one safeguards.
- PostgreSQL concurrency/failover, reverse-proxy/edge controls and a real mobile browser are not verified. Browser QA for the phase-one admin predates this capture integration; the new frontend has script-level tests but not a new end-to-end browser recording.
- Production historical subscriber reconciliation/import and approval-gated marketing delivery remain separate. Sender identity, unsubscribe/complaint/bounce suppression, provider marketing permission/cost and per-send consent checks must be resolved before any sending feature.

## Rollback
Disable capture and update flags. Homepage returns to its previous Formspree path and no new release drafts are created. Existing ledger/evidence remains preserved. A first-party form already open fails safely rather than silently sending its details to Formspree. Existing orders and payment queues are unchanged.

## Independent review corrections
Unverified public submissions now append evidence without replacing existing verified subscribed consent or any suppression. Read-time draft status independently validates publication/expiry and returns expired or invalid even if the manifest transaction failed, retaining recordedStatus for audit. Publication and expiry use the same strict explicit-timezone/calendar validator as consent evidence; missing zones and rolled-over dates are rejected. Invalid/old signup forms advise reload without revealing whether an address exists. Tests cover anonymous same-email submissions, bad manifest plus old expired promotion, invalid metadata, UTC/Brisbane parity and safe reload guidance.

Consent resolution is now deterministic from retained evidence, rather than import order: any suppression wins; otherwise the latest explicit verified newsletter grant wins; pending/unknown records only describe a contact with no verified grant. Pending/unknown records never advance the consent decision timestamp. Both pending-first and verified-first imports yield the same verified grant, and old incorrectly stored pending decision fields are corrected in read views and on duplicate re-import. Unknown means missing evidence, not withdrawal; use suppression for a withdrawal.
