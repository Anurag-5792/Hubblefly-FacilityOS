# W0-05 Organisation / Legal Entity / Site / Identifier

**Status:** implementation package for the first real FacilityOS business-foundation schema.

## Scope

W0-05 implements only:

- core Organisation;
- Legal Entity;
- Site;
- Site-to-Legal-Entity association;
- generic identifier-series definition;
- sequence state;
- immutable identifier allocation;
- domain-specific repositories and application services.

It does not implement IAM/RLS, physical Store/Zone/Rack/Bin hierarchy, ERP references, business
documents, audit-event infrastructure or legacy migration.

## Organisation, Legal Entity and Site

The PostgreSQL namespace is `core`.

- Organisation is the FacilityOS operational grouping/context.
- Legal Entity belongs to exactly one Organisation.
- Site belongs to exactly one Organisation.
- Site is not an ERP Warehouse.
- `core.site_legal_entity` is an explicit bridge.

The bridge deliberately permits one physical Site to support multiple Legal Entities in the same
Organisation. Composite foreign keys prevent a cross-Organisation Site/Legal Entity association.

W0-05 application services require at least one Legal Entity when a Site is created. This rule is
kept in the coordinated application transaction rather than introducing a complex deferred
cross-table trigger before the later security and physical-location packages exist.

No production HTL/DDL/Agristar/Hubblefly Batteries rows are seeded by the schema migration.

## Lifecycle and deletion

Organisation, Legal Entity, Site, Site-Legal-Entity links and identifier series use explicit
`ACTIVE` / `INACTIVE` lifecycle state plus an optimistic `version`.

Repositories expose no hard-delete operation. Database foreign keys use `ON DELETE RESTRICT`.

This does not replace future immutable audit-event history.

## ERP boundary

FacilityOS Legal Entity is an operational scope record, not a copy of ERPNext Company.

W0-05 stores no verified ERP Company ID, abbreviation, default Company, Warehouse mapping or
intercompany configuration. Full external ERP references remain W0-11 scope.

## Human identifier architecture

Internal UUID identity and human document number remain separate.

`core.identifier_series` defines:

- Organisation;
- series key;
- format template;
- sequence width;
- whether Legal Entity scope participates;
- whether Site scope participates;
- whether a period is required;
- lifecycle/version.

Organisation is always the base FacilityOS scope. Additional Legal Entity, Site and period
dimensions are explicit per series.

`core.identifier_sequence` stores the next value for one exact scope. Its unique constraint uses
PostgreSQL `NULLS NOT DISTINCT`, so nullable scope dimensions still identify exactly one sequence
state.

`core.identifier_allocation` is the committed allocation record. Update and delete are rejected
by a database trigger after commit.

Future business records should reference a committed allocation/internal identifier rather than
accepting arbitrary client-generated document numbers.

## Period / year policy — REQUIRES VALIDATION

W0-05 does not decide whether the approved `26` token means calendar year, Indian financial
year, fiscal-year ending year or another business period.

The caller supplies:

- a stable `period.key` used for sequence isolation;
- a display `period.token` used in formatting.

For example the same token `26` can be passed with a policy-defined key without W0-05 knowing
what that period means.

A later explicitly approved business/configuration decision must own period resolution.

## Allocation concurrency

Allocation uses one existing W0-03 UnitOfWork transaction:

1. validate series and scope;
2. lazily insert the exact sequence-state row using its unique scope key;
3. atomically update `next_value = next_value + 1 returning next_value`;
4. format the identifier;
5. insert immutable allocation evidence;
6. commit the transaction.

PostgreSQL row/update locking serializes concurrent writers to the same sequence state. Different
series/scopes use different sequence rows and remain independent.

There is no `MAX(number) + 1`.

## Rollback and gaps

A number is formally allocated only when the transaction commits.

If the transaction rolls back:

- the sequence increment rolls back;
- the allocation row rolls back;
- that never-committed number can be allocated later.

After a committed allocation, the allocation cannot be edited or deleted. If a future business
record is cancelled/reversed/voided, that committed number remains consumed.

Therefore FacilityOS does **not** promise gapless numbering. Correctness, uniqueness and historical
auditability take precedence.

## Repository / application-service boundary

The pattern remains:

Application Service
→ domain-specific repository
→ W0-03 UnitOfWork
→ Kysely/pg
→ PostgreSQL

No generic CRUD repository and no second transaction mechanism are introduced.

W0-04 `Clock`, `ActorContext`, `OperationContext`, `InternalId` and `AggregateVersion` are
reused.

## Security boundary

W0-05 adds no Supabase Auth integration, IAM tables, roles, permissions, AuthorizationService,
SUPERUSER or production RLS policies.

The organisational scope columns required by later RLS are present.

The browser does not receive a number-generation algorithm or direct identifier allocator.
