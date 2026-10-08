# W0-03 Database Access / Repository / Unit-of-Work

**Status:** W0-03 infrastructure foundation.

This layer is server-only and intentionally contains no FacilityOS business-domain repository.

## Dependency direction

`Application Service -> domain-intent repository -> UnitOfWork transaction -> Kysely -> pg -> PostgreSQL`

Application services own transaction boundaries. Repositories do not silently open independent
transactions.

## Public server entry

Target server code imports database runtime access through:

`src/platform/db/server.ts`

The entry and privileged runtime modules import Next.js' `server-only` marker. Browser code must
never import these modules or receive `DATABASE_URL`.

## Pooling

The application runtime creates one process/module-scoped `pg.Pool` and reuses it for the lifetime
of the server runtime.

Defaults:

- max connections: 5
- idle timeout: 10 seconds
- connection timeout: 5 seconds
- application name: `facilityos`

The limits are environment-configurable and intentionally conservative for serverless execution.
The hosted Supabase direct-vs-pooler connection string will be selected only when hosted
environments are authorised. W0-03 does not configure Vercel or hosted Supabase.

The pool is not opened/closed per HTTP request. `destroy()` exists for tests, scripts and
controlled process shutdown.

## Unit of Work

`UnitOfWorkManager.withTransaction(...)` owns exactly one Kysely transaction.

All repositories created from a UnitOfWork receive that same transaction executor:

```text
withTransaction
  -> repository A(transaction)
  -> repository B(transaction)
  -> one commit
```

An exception from application code or PostgreSQL escapes the callback, causing Kysely/PostgreSQL
to roll back the entire transaction.

### Nested transactions

Nested `withTransaction` calls are deliberately rejected with `NestedTransactionError`.

A dependent application service must receive the existing UnitOfWork rather than silently
creating a savepoint or unrelated transaction. If savepoints become a real business requirement,
they require a separate architecture decision.

### External calls

ERP, Storage, notification and other network calls must not be performed while holding long-lived
database transactions. Future application services commit FacilityOS state/outbox intent first,
then external workers act afterward.

## Repository pattern

`TransactionalRepository` stores only the transaction executor. It provides no generic CRUD
methods.

Domain modules must expose intent-specific methods such as:

- `reserveSerial(...)`
- `appendGenealogyEvent(...)`
- `completeOperation(...)`

rather than `save(table, data)`.

## Optimistic concurrency

Mutable aggregate repositories will implement:

```sql
update <aggregate>
set ..., version = version + 1
where id = :id
  and version = :expected_version
```

After execution, `assertSingleVersionedUpdate` requires exactly one affected row.

- 1 row -> success
- 0 rows -> `OptimisticConcurrencyError`
- more than 1 row -> invariant failure

W0-03 proves this pattern against a temporary PostgreSQL fixture; it does not create a permanent
FacilityOS aggregate table.

## Database error translation

PostgreSQL errors are translated before leaving the infrastructure boundary:

- 23505 -> unique violation
- 23503 -> foreign-key violation
- 40001 / 40P01 -> retryable serialization/concurrency failure
- PostgreSQL connection-class/network failures -> database unavailable
- transaction-aborted errors -> transaction failure
- other PostgreSQL-coded errors -> controlled database operation error

Ordinary application/domain errors are not rewritten.

Raw PostgreSQL details must not be exposed directly to UI responses. W0-04 will define the broader
application error catalogue.

## Health/readiness

`DatabaseRuntime.healthCheck()` executes a minimal `select 1` and translates failures to the
controlled unavailable-database error.

This is a technical readiness primitive only; it does not prove domain or ERP readiness.

## Test fixture

W0-03 adds no permanent test/business schema migration.

PostgreSQL integration tests load
`tests/integration/database/fixtures/w0-03.sql`, which creates TEMP tables in a single-connection
test pool. The fixture disappears when that pool closes and never enters the Supabase migration
chain.

The generated production database types remain derived exclusively from
`supabase/migrations/*.sql`.

## Verification

Run:

```bash
pnpm db:verify
pnpm test:db:unit
pnpm test:db:integration
pnpm typecheck
pnpm lint
pnpm build
```

`test:db:integration` starts local Supabase, resets migrations, runs DB lint and executes the
W0-03 tests against the local PostgreSQL instance. Docker is required.
