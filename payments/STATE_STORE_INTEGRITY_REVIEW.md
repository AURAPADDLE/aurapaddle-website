# PostgreSQL state integrity review

This isolated change follows the real PostgreSQL test that reproduced silent success when the singleton `aura_state.id=1` was missing. It does not change JSON storage or deploy anything.

- Normal PostgreSQL startup now validates the existing table and object-valued singleton. It does not create missing data.
- Read/mutate reject absent or invalid singleton data with AURA_STATE_INTEGRITY. Mutation callbacks do not run on missing data, and exactly one persisted update is required.
- Explicit `createStateStore({databaseUrl, bootstrapPostgres:true})` is available only for deliberate first-time provisioning of an entirely new database/table. Concurrent provisioners serialize via transaction advisory lock. An existing table with a missing/invalid row always fails, even with this option. The application server does not pass this option and no public/admin endpoint exposes it.
- Bootstrap is NOT recovery. Never enable it against a damaged database or a database expected to contain orders. Restore a verified backup instead; confirm id=1 and state contents before restart.
- Existing normal production databases need no data migration. Startup failure after this change means integrity must be investigated, not bypassed by inserting empty data.
- Original transaction failures remain the primary error even if rollback itself fails. Network-failure recovery remains outside the tests.

Regression file: `payments/state-store-postgres.test.mjs`. It only runs with AURA_TEST_POSTGRES_URL pointing to loopback and an `aura_test_` database; otherwise skips. It creates/removes a random isolated schema and checks missing-table rejection, concurrent explicit bootstrap, unchanged startup data, transaction serialization/rollback, missing-row rejection, invalid-data rejection, and zero-row UPDATE rejection. No production credentials are required or allowed. The full newsletter regression remains required, plus actual pg_dump/restore testing of synthetic state.

Namespace validation also rejects arrays/null/scalars for orders, Stripe events and present optional map containers. Core orders/events cannot be missing. Optional namespaces absent from legitimate older versions are added only in memory until a successful mutation; read/startup do not rewrite the stored row and unknown fields are retained. Newsletter's three maps must exist when its namespace exists. Inventory's present map and array containers retain their documented types. Validation runs again after a mutation callback, before serialization, to prevent array properties from being silently discarded. This is structural validation, not a complete schema audit of every individual business record.

Known object containers must also have Object.prototype or null prototype and no callable toJSON. The actual JSON serialization is parsed and structurally checked before it is sent to PostgreSQL. This rejects Date/Map/Set, custom prototypes/serialization, and non-enumerable required containers without breaking ordinary JSONB data or null-prototype maps.
