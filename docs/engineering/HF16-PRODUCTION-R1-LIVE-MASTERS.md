# HF16-PRODUCTION-R1-LIVE-MASTERS — source engineering handover

Parent: HFT-R1-MASTER-V4-DELIVERY-QUALITY-077
Issue: https://github.com/Anurag-5792/Hubblefly-FacilityOS/issues/12
Starting engineering HEAD: 1b3b5274a80cd1a2444f445407501cc69e30cde2
Mode: production-capable source, independently admitted infrastructure and tests only.
Gate R HOLD / Gate A HOLD / Production NO-GO. Do not merge PR #11.

## Scope and evidence boundary

Six business record kinds: EMPLOYEE, ITEM, SUPPLIER, WAREHOUSE, LOCATION, SITE.
The independent `hft_live_r1` schema does not insert into `hft` protected
master records, P0/P2/P3 functions, stock ledger, or accepted QC/GRN/approvals.
A `RECORDED_UNAPPROVED` live master is a durable company record; it cannot
authorize RECEIVE, ISSUE, RETURN, TRANSFER, procurement or posting.

This extends the existing FacilityOS Next.js repository. The /masters/live screen
uses the existing masters-shell, panel and data-table patterns and authenticated
signed-session adapter. No rebuilt standalone frontend, regenerated dependencies,
new PostgreSQL ledger or default Owner Administrator was introduced.

## Versioned, additive installation

1. `db/live/0001_live_r1_records.sql`
   SHA-256 `72e3d0801ba29c156596a148e599e39256e7b05fadc3407ea9d139aed70bc898`
2. `db/live/0002_live_r1_gateway.sql`
   SHA-256 `6e26f6970a8963c16f279bd332b6b58391b4551a60f5809419af32afba4d559d`

These are production-boundary candidate files, NOT installed migrations.
They must run on a dedicated, newly qualified `hft_r1_live_*` database under
the separately provisioned nonlogin `hft_r1_live_owner`, with separately
created restricted `hft_r1_live_api_login`. SQL contains a hard wrong-target
guard. Neither file creates or enrolls corporate users or a grant to protected
stock/P3 functions. Migration 0002 grants only schema USAGE, read-only
installation/revision metadata SELECT, and four exact SECURITY DEFINER entry
functions to the service login.

After reviewed installation, Chat 13 records the two actual migration digests
in `hft_live_r1.schema_revision` and the independently admitted target,
installer and release identities in `hft_live_r1.installation`.
No dummy binding or placeholder hash is inserted by engineering source.
The original enrollment custodian separately inserts valid OIDC subject/person,
scope, permission codes, date boundaries and original enrollment reference into
`hft_live_r1.actor_scope` using installation authority. No developer,
support, named employee or first-login grant exists by default.

DB record writes are serializable, revision-CAS and audit-event coupled in one
transaction. The immutable audit trigger is ALWAYS enabled. Hard deletion of
master records and all updates/deletes of immutable revision events are forbidden
to the service login. Deletion is a new `deleted=true` revision only. No key
is reused. A save is reported SAVED_VERIFIED only after independent
new-transaction GET and HISTORY readback. Uncertain COMMIT/readback means
NO_RETRY and reconciliation against the original request ID.

## Runtime and authentication

Set `HFT_LIVE_R1_PROFILE=HFT_R1_PRODUCTION_LIVE_MASTERS_V1` only for the
independently admitted production or explicitly isolated production-qualification
deployment. Nonproduction retained/Draft/Stores role profiles are forbidden.
Required production-bound pins include resource project/branch, exact database
name/OID, PostgreSQL version, endpoint, CA PEM, role login, migration hashes,
target admission, installer, release, backup/restore and corporate OIDC admission
hashes. The application confirms backend TLS, session_user, table/column ACLs,
owner membership, function allowlist, two exact enabled triggers, and installed
binding on EACH SQL transaction. No table business-record SELECT/DML is granted.
Only read-only schema metadata SELECT is allowed to the restricted login.

`/api/hft/live-masters/auth/start` and callback use real external OIDC PKCE
and an issuer-signed Ed25519 short session. The approved actor map requires
verified email AND exact provider `sub`; database actor_scope independently
checks actor subject and scope permissions. Chat 13 must register the genuine
corporate OIDC application and manage its secrets. No service impersonation or
role bypass is introduced. Both the real production route and its dedicated
health endpoint deny when admission is missing. Existing P0/P2/P3/Draft
backends remain closed in live production profile.

## Real PostgreSQL qualification

`node --experimental-strip-types tests/postgres/hft-live-r1-qualification.ts --describe`
is source discovery only. Real execution requires a separately approved
production-like fixture database, verified DB/login/TLS/backup credentials,
enrolled approved corporate test identity, and a securely delivered signed
session cookie. Run phase before under a first admitted release and phase after
under a different admitted compatible release with the same DB and result marker.
No real production test mutation is authorized by this engineering directive.

Required acceptance evidence: actual restricted SQLSTATE permission denials,
Employee CREATE v1, COMMIT and fresh GET/HISTORY, scoped denial, logout/login
and reopened UI v1, UPDATE v2, unchanged original audit, backup and isolated
restore, application update with v2 retained. Qualify Item, Supplier, Warehouse,
Location and Site equivalently before R1 acceptance.

Production-safe upgrades are expand-first, additive, version pinned and
backward-compatible. Test the previous binary against the expanded schema
BEFORE a data-affecting migration; deploy backwards-compatible readers and
writers, retain previous snapshots, capture encrypted backup/independent restore
and never rollback by dropping live data. A failed release rolls back application
code only to a separately qualified schema-compatible previous version.
Migration 0001/0002 is an initial baseline, not a promise that all future
migrations are automatically backward-compatible.

## Responsibility

Chat 16 owns source and source CI; Chat 13 V3 owns dedicated production
resource, enrollment, restricted login, OIDC, external verified TLS,
backup/restore, staged release and actual user acceptance.
Chat 11 verifies independent execution authority. No production deployment,
owner enrollment, Rishabh grant, stock posting or PR merge under this prompt.
