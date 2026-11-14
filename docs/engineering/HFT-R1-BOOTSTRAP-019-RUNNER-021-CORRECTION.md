# HFT-R1 BOOTSTRAP-019 — STAGING RUNNER 021 SOURCE CORRECTION

**Decision:** SOURCE ENGINEERING ONLY; NO DB DDL, role/key creation, data posting,
staging recovery test or production promotion executed.
**Authority:** MASTER V3 HFT-R1-MASTER-V3-STAGING-RUNNER-021.
**Current governance:** Chat 10 and Chat 11 REQUEST CHANGES; MASTER review hold remains.
**Source ownership:** Chat 16 corrections, Chat 13 infrastructure and any future execution.
**Repository:** Anurag-5792/Hubblefly-FacilityOS; existing engineering branch / draft PR #11.

## Do not introduce a second online migrator

Chat 13 committed an existing online Neon runner (tools/hft_neon_staging_bootstrap.py)
at 889746f before Chat 16's new source was ready to commit. Chat 16 reconciled
the actual branch HEAD f060cdf, discarded the redundant independent Node
runner draft and corrected the ONE existing Python staging runner in place.
The Windows-only tools/hft_apply_migrations.py remains unchanged.

## Pinned target

Neon project red-silence-36758131, branch vercel-dev,
branch ID br-dawn-moon-azd9xzrp, database neondb, PostgreSQL 18.6,
region aws-ap-southeast-1. Direct write endpoint
ep-lingering-tooth-azvv1jmr at the Chat 13 accepted direct Neon hostname.
The default Neon production branch is excluded.

No real Neon secret, password, API token or stock fixture is in this source.

## Controls corrected in the existing runner

1. Pin the SHA-256 of db/migrations/manifest.v1.json AND all six canonical
   SQL source hashes. Validate incompatible rejected-0005 provenance and
   reject unexpected/nested SQL. No db/security review-only SQL is a migration.
2. Require a fresh authenticated Neon HTTPS control-plane lookup of
   project, branch and endpoint (pinned ID, direct host, Singapore region
   and read_write type). A caller-supplied JSON attestation alone is NOT
   sufficient proof of control-plane identity. Deny HTTP redirects and hide
   all raw provider errors and tokens.
3. Require libpq PGSSLMODE=verify-full and exact direct Neon hostname.
   The Neon pooler may show backend pg_stat_ssl.ssl=false even though the
   CLIENT connection is certificate-verified; a proxy backend reading alone
   cannot be used to claim a client TLS failure or a client TLS PASS.
4. The canonical six migration bodies and all six revision records are
   assembled into ONE SQL script and ONE SERIALIZED database transaction.
   One transaction-scoped pg_try_advisory_xact_lock prevents a second
   cooperating migrator from applying parallel DDL.
   First migration requires no unexplained objects or existing revision
   ledger, and creates the revision ledger within the same transaction.
   Other revisions require the exact prior revision hash.
   On SQL error the session rolls back; unknown/missing post-COMMIT ACK
   requires read-only reconciliation and prohibits automatic retry.
5. Global PUBLIC default function EXECUTE is revoked and explicitly
   checked for each ACTUAL creator: hft_staging_migration_owner,
   hft_r1_posting_owner and hft_r1_p3_master_owner. An absent global
   pg_default_acl record is NOT evidence that PUBLIC EXECUTE is revoked.
6. Role/bootstrap SQL is now reviewed via a single pinned source in
   db/security with three separate artifacts:
   - HFT-R1-BOOTSTRAP-019-DBA-ROLE-NONEXECUTABLE.sql
   - HFT-R1-BOOTSTRAP-019-CREATOR-ACL-NONEXECUTABLE.sql
   - HFT-R1-BOOTSTRAP-019-DBA-CLOSE-NONEXECUTABLE.sql
   The running code verifies each artifact SHA-256 before any future use.
   There is no role-creation SQL automatically executed during npm build.
7. The final DBA-only review SQL removes temporary database CREATE,
   rejects unapproved runtime stock-table/sequence privileges, tests
   schema ownership and demands no publicly executable HFT functions.
8. An explicit source-pinned independent review-evidence hash is left EMPTY,
   because Chat 10/11 REQUEST CHANGES has not been resolved. CLI flags,
   arbitrary human names and environment variables cannot clear this hold.
   A later reviewed source revision must pin accepted evidence after MASTER
   authorizes execution. No mutation phase may begin until this is done.

## Frozen migration vs P2/P0 review boundary

Canonical 0001-0006 and their manifest SHA-256s are unchanged.
The online runner does NOT install pgcrypto, signed session keys,
P2 one-writer SQL, P3 masters SQL, P0 COUNT candidates, or a secondary
stock ledger. No draft review-only SQL file has been promoted into
db/migrations.

P2/P3 candidate preflights still contain assumptions made for the
older isolated local hft_engineering identity and disposable database
naming scheme. The online staging migration owner is instead
hft_staging_migration_owner on database neondb. Those function-owner,
pgcrypto, and P0 version/transfer/count/readback integration changes
are separately review-required. They must not be bypassed by using
neondb_owner as the stock runtime identity.

## Tests vs executed system evidence

Runner positive/negative cases use scripted Python responses and
static SQL source inspection only; none executes SQL against Neon.
The only CLI run is verify-manifest, which hashes files locally.
Denied mutation phases are verified to stop before database I/O.
The Node application still has its existing source-only protected
IN/OUT and COUNT adapter, transfer fail-closed and signed readback.

Chat 13 must supply approved snapshot/recovery evidence, actual role
custody and credentials, accepted control-plane records, and separately
authorized DDL execution. Chat 10/11 must close REQUEST CHANGES;
Chat 17 must witness real rollback, concurrency, duplicate prevention
and readback. Until then staging operational acceptance and production
technical GO remain denied.

## Supersession

This narrowly supersedes the CORRECT-020 document's former per-migration
separate COMMIT, static attestation-only trust and five-role initial
bootstrap descriptions. CORRECT-020 remains in the repository for
historical provenance. The binding source is the exact HEAD associated
with this RUNNER-021 amendment, not an unexecuted instruction.

