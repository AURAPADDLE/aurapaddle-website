# Newsletter phase 1: private ledger and draft review

Historical phase-one report. See NEWSLETTER_CAPTURE_REVIEW.md for the subsequent capture/release integration and current test totals.

## Scope and release status
Isolated implementation based on `4bd079c75150ca1504d067e0cefa80f87fc29360`. Not deployed, pushed, or imported into production. No sending implementation exists. Existing payment/order and email queues are not changed.

The order admin links to `/admin/orders/newsletter/`. Private JSON API paths require the existing administrator bearer token and `NEWSLETTER_ADMIN_ENABLED=true`. This flag defaults off. Public static HTML contains no contact data. The existing state store persists the `newsletter` namespace in PostgreSQL in production and JSON during local tests.

## Workflow
1. Review a source record (such as a Formspree export or original notification). Record normalized email, source, stable source ID, timestamp, evidence reference, consent status, exact consent text/version, reviewer verification and internal/test classification.
2. Source records are idempotent. Changed evidence cannot overwrite the same record. Evidence events are retained for audit. Unsubscribe always wins, including when older or newer subscribed records are subsequently imported. Re-subscription is deliberately not available in phase 1.
3. Orders and enquiries are not copied into the newsletter audience. Advertising cookie permission and recovery-email permission cannot pass as newsletter consent. AURA-domain addresses, example-domain fixtures, manually marked tests and customers attached to an `internalTest` order are excluded.
4. An operator records an intentional publishable website update or promotion, with a stable update ID, revision, verified facts and HTTPS AURA landing URL. This automatically creates plain-text email copy and an audience snapshot for review. Repeated save is idempotent. Changed content requires a new revision.
5. Drafts show current candidates, exclusion reasons and their original audience snapshot. A change in consent triggers an audience-change warning. No approval or send button is provided. No draft is added to any email outbox.

## Important remaining work before any live marketing
- Production import needs a reviewed source list and exact historic consent evidence; do not seed the code with customer addresses.
- Homepage signup remains Formspree in this phase. No public capture/webhook/API has been changed. End-to-end automatic new-signup ingestion and deployment/content event integration are subsequent work, not claimed complete.
- Generation currently runs on explicit admin update creation, not automatic discovery of deployments. This avoids emailing typo edits or unapproved promotions.
- Sending remains a separate approval-gated phase. Verify sender identity/address, provider marketing suitability, quotas/cost and permissions; implement purpose-specific unsubscribe and complaint/bounce suppression, re-evaluate audience just before sending, bind approval to content revision/recipients, and use durable idempotency. Do not repurpose the existing recovery unsubscribe as a newsletter unsubscribe.
- Access remains the existing shared administrator role; no new user accounts or credentials. A production audit actor identity requires future per-user auth integration.
- Small-list phase 1 uses the current single-row state store. Capacity, paginated UI and evidence retention/deletion policy must be reviewed before bulk import.
- Back up production state and verify restore before deployment/import. Rollback by disabling the feature flag and reverting the navigation/module changes; retain newsletter state for audit. No destructive migration is necessary.

## Verification
- New automated tests: 18/18 pass (module and real local HTTP server).
- Full existing plus new suite: 197 tests, 196 pass, 1 fails because the isolated checkout lacks the untracked `payments/geo-data/dbip-country-lite.mmdb`. The geo resolver and test are unchanged; do not bypass the failure or claim a full green suite.
- Tested: admin authentication and default disabled state, JSON no-store, cross-origin write denial, static data non-disclosure, source deduplication/conflict rejection, explicit consent validation, unsubscribe priority, internal/test exclusion, draft snapshot changes, no sending route/outbox, order API regression.
- Local browser QA with dummy token and synthetic data: rejected login, valid login, save evidence, internal exclusion, draft creation, lock and reload. No live subscriber used. Responsive/mobile browser and PostgreSQL concurrency tests are not run.

## Review commands
`npm ci --ignore-scripts --prefix payments`
`node --test payments/newsletter.test.mjs payments/newsletter-integration.test.mjs`
`npm test --prefix payments`

For local fixture review only: set `HOST=127.0.0.1`, `PORT`, `PUBLIC_SITE_URL`, `ORDER_DATA_DIR` to a new empty local directory, a dummy `ADMIN_API_TOKEN`, and `NEWSLETTER_ADMIN_ENABLED=true`. Do not copy production credentials or `.env`. Never enable live payment or mail keys for UI tests.

## Independent review corrections
All bounded text rejects excess length instead of truncating. Evidence, consent text, source identifiers and draft facts retain their exact original text. Normalized email, timestamps and URLs are accompanied by originals. Invalid text types, ambiguous boolean flags and invalid calendar dates are rejected. Composite identities use JSON arrays to avoid newline separator collisions. HTML maxlength attributes were removed to avoid browser paste truncation. The UI discards stale load responses and prevents a locked session from being reopened by an in-flight request. Regression tests cover these cases.
