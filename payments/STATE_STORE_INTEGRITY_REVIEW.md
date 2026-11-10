# PostgreSQL state integrity review

This isolated change follows the real PostgreSQL test that reproduced silent success when the singleton `aura_state.id=1` was missing. It does not change JSON storage or deploy anything.

- Normal PostgreSQL startup now validates the existing table and object-valued singleton. It does not create missing data.
- Read/mutate reject absent or invalid singleton data with AURA_STATE_INTEGRITY. Mutation callbacks do not run on missing data, and exactly one persisted update is required.
- Explicit `createStateStore({databaseUrl, bootstrapPostgres:true})` is available only for deliberate first-time provisioning of an entirely new database/table. Concurrent provisioners serialize via transaction advisory lock. An existing table with a missing/invalid row always fails, even with this option. The application server does not pass this option and no public/admin endpoint exposes it.
- Bootstrap is NOT recovery. Never enable it against a damaged database or a database expected to contain orders. Restore a verified backup instead; confirm id=1 and state contents before restart.
- Existing normal production databases need no data migration. Startup failure after this change means integrity must be investigated, not bypassed by inserting empty data.
- Original transaction failures remain the primary error even if rollback itself fails. Network-failure recovery remains outside the tests.

Regression file: `payments/state-store-postgres.test.mjs`. It only runs with AURA_TEST_POSTGRES_URL pointing to loopback and an `aura_test_` database; otherwise skips. It creates/removes a random isolated schema and checks missing-table rejection, concurrent explicit bootstrap, unchanged startup data, transaction serialization/rollback, missing-row rejection, invalid-data rejection, and zero-row UPDATE rejection. No production credentials are required or allowed. The full newsletter regression remains required, plus actual pg_dump/restore testing of synthetic state.
