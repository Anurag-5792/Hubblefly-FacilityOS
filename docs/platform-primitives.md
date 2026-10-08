# W0-04 Platform Primitives

**Status:** W0-04 domain-neutral technical foundation.

These primitives are deliberately small and do not implement FacilityOS business modules, IAM,
ERP integration, number series, workflow engines or database transaction ownership.

## Internal IDs

FacilityOS internal application IDs use PostgreSQL-compatible UUID strings.

Runtime generation uses Node's native `crypto.randomUUID()` (UUIDv4). The parser accepts valid
RFC UUID variants including version 7 so a future generation-policy change does not require a
database type change.

Internal IDs carry no company/site/year/customer/project meaning, are not human document numbers,
are immutable references, and are suitable for PostgreSQL `uuid` columns.

Business identifiers such as `HF-MFG-26-XXXX` are explicitly outside W0-04.

## Time

Domain/application code receives a `Clock`.

- `SystemClock` supplies runtime time.
- `FixedClock` supplies immutable deterministic test time.
- `TestClock` supports controlled test advancement.
- persisted timestamp primitives are canonical ISO-8601 UTC values ending in `Z`.

Business/local timezone rendering belongs outside persistence/domain primitives.

## Actor and operation context

`ActorContext` distinguishes HUMAN, SERVICE, SYSTEM and MIGRATION. It intentionally does not
decide authentication or authorization.

Operation tracing uses independent typed RequestId, CommandId, CorrelationId and CausationId.

## Idempotency

An idempotency identity is the pair `IdempotencyScope + IdempotencyKey`. Retries of the same
logical operation retain both values. Future persistent uniqueness must include the operation
scope rather than treating a raw key as globally meaningful.

W0-04 creates no idempotency table.

## Aggregate versions

`AggregateVersion` is a non-negative safe integer. The initial application version is 0 and
increments explicitly.

W0-03 remains responsible for PostgreSQL optimistic concurrency and version-guarded UPDATEs.

## Errors and invariants

Application/domain errors are independent of HTTP and Next.js. Public serialization excludes
internal causes and stack traces. Zod remains the runtime/input boundary validator; invariant
helpers are for trusted domain rules and do not compete with Zod.

## State transitions

The transition utility answers only current-state + requested-state -> allowed/rejected. A domain
supplies its own explicit pairs. No FacilityOS workflow states or generic workflow engine are
embedded in W0-04.

## Events and versioning

Event metadata provides event ID/type, entity reference, optional aggregate version, UTC occurrence
time, actor, request/command/correlation/causation IDs, explicit event/schema version and bounded
JSON metadata.

Event envelopes are in-memory contracts only. W0-04 creates no persistent Domain Event, Audit
Event, Integration Event or outbox table.

## Pagination and sorting

Offset and cursor pagination are distinct contracts. Cursors are opaque. Sorting accepts only
caller-provided allowlisted fields; repositories must map those public fields to trusted Kysely
expressions rather than using raw user input as SQL identifiers.

## Serialization

Transport serialization supports JSON primitives, arrays/plain objects, Date, bigint and Error.

- Date -> canonical UTC ISO string
- bigint -> decimal string
- typed ApplicationError -> stable public payload
- unknown Error -> generic INTERNAL_ERROR payload
- stack/cause/internal Error message -> excluded

No custom wire protocol is introduced.

## Transaction boundary

All future database work continues to use W0-03 `UnitOfWorkManager`. W0-04 adds no database
client, transaction abstraction, repository commit behavior or schema.
