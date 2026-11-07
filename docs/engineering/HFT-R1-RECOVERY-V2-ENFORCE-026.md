# HFT-R1 MASTER V3 — Recovery V2 Enforcement 026

Directive: HFT-R1-MASTER-V3-RECOVERY-V2-ENFORCE-026
Mode: SOURCE ONLY. Neon, SQL, resources, backups, restores and production: HOLD.
Starting HEAD: 0ba7c6659e3b3ca9d321af3c66dd88eee0e60474
Branch: engineering/hft-r1-stores-foundation; existing draft PR #11.

This corrects the Recovery V2 implementation, not its operating authorization.
The old 025 document remains in Git history as superseded provenance.

## Controlling source, integrity and authorization pins

The only ONLINE bootstrap runner remains tools/hft_neon_staging_bootstrap.py.
The separate Recovery V2 validator is tools/hft_neon_recovery_v2.py. No parallel
stock ledger or migration authority was introduced.

config/hft-recovery-v2-source.sha256 pins the validator's exact byte hash.
Gate A's accepted authorization MUST include the same
recovery_validator_sha256, plus exact runner, four approved SQL source and
six-entry canonical manifest hashes. A source change invalidates previous
authorization evidence. The HFT BOOTSTRAP-019 review and execution pins remain
HOLD. config/hft-recovery-v2-witness-trust.sha256 is also HOLD until a trusted,
independently verified corporate human-witness public key and identity record
are approved and pinned through governed source.

Unchanged: db/migrations/0001–0006, manifest.v1.json and their SHA-256,
local-only tools/hft_apply_migrations.py, protected role/ACL requirements,
transaction/advisory-lock atomicity, uncertain-COMMIT no-retry and the
repository hygiene gate.

## Provider-native retention: actual Neon API fields only

The future approved runner performs fresh certificate-verified Neon control
plane GETs without HTTP redirects. The preservation branch must be a child of
staging vercel-dev / br-dawn-moon-azd9xzrp, in project red-silence-36758131.
The default production branch ID br-bold-smoke-az9qmfaf is EXCLUDED.

Provider readback must contain id, project_id, name, parent_id, parent_lsn,
created_at, default, primary, expires_at and ttl_interval_seconds
(parent_timestamp where available). No synthetic branch.retention object is
read. The branch must not be default or primary and must have no endpoint;
its normalized provider record and captured parent LSN are hash-bound to the
preserved inventory and both restore paths.

If expires_at is finite it must extend beyond BOTH the Recovery V2 evidence
window and the later Gate A authorization expiry. If expires_at and
ttl_interval_seconds are explicitly null, that denotes ONLY
NO_SCHEDULED_EXPIRATION; it does not guarantee indefinite preservation.
Missing fields, unknown TTL, stale provider readback, altered LSN, expired
resources and contradictory indefinite claims fail closed.

## Fresh verification of BOTH isolated recovery targets

The real runner performs separate read-only provider GETs for the preservation
branch, Recovery A branch, Recovery B branch and the database collection scoped
to the exact Recovery B branch ID. All IDs must belong to the approved Neon
project. Recovery A's provider parent_id must be the preservation branch and
its creation timestamp must fall within its signed provider-operation receipt.
Recovery B must have a separate, nondefault/nonprimary recovery branch
provisioned BEFORE the recorded pg_restore invocation; its isolated database
must be listed by the provider under that exact branch ID.

The real production ID br-bold-smoke-az9qmfaf, active staging
br-dawn-moon-azd9xzrp, preservation source branch and the opposing recovery
target cannot be used as overwrite targets. Recovery B's database must be a
distinct hft_restore_... name rather than active neondb.

## HFT_R1_NEON_PRECHANGE_RECOVERY_V2 evidence contract

The evidence manifest has exact source project, branch, database, source_lsn,
source_state_sha256, preservation, dump, inventory, restore_a, restore_b,
independent_witness, creation timestamp and expiration.

Preserved source evidence must contain:
1. The exact provider-native preservation branch identity, creation, LSN,
   timestamp, parent, no-endpoint state and checked expiration/TTL.
2. Direct/unpooled, TLS-verified PostgreSQL 18 custom-format pg_dump;
   byte size, PGDMP header, SHA-256, tool versions, staging write-endpoint
   ID, source LSN, source-state digest and hashed pg_restore --list output.
   Dump hashing streams the file instead of loading it into memory.
3. Complete canonically normalized JSON inventory of roles, memberships,
   schemas, extensions, objects, owners, ACLs and revisions. Each section
   hash must derive from the stored content; the combined normalized
   source-state digest must match the manifest and dump.
4. A preservation-derived Recovery A branch-creation receipt and independent
   Recovery B pg_restore --single-transaction --exit-on-error receipt.
   Both require source and dump hashes, exact target, command metadata,
   start/finish, exit code, stdout/stderr SHA, provider operation ID where
   applicable and independent, canonically hashed catalog/ACL readbacks.
   All eight restored section hashes must match the prechange inventory.
5. A real independent human-witness JSON statement, detached Ed25519
   signature and a separately approved/pinned corporate identity trust record.
   The signed subject includes all preceding source, provider and restore
   hashes. The witness signature must postdate both completed readbacks.
   File SHA-256 alone is NOT an authentication of its producer.

All structured evidence files must be canonical UTF-8 JSON and byte-hash
verified. The source-only tests use deliberately synthetic PGDMP markers and
synthetic OpenSSL Ed25519 keys; they are not a real backup or a real human
attestation. The corporate witness trust SHA remains HOLD.

## Real live database phase-state enforcement

Every mutating runner phase first rechecks independent review and Gate A pins,
exact source and Recovery V2 evidence hashes, current Neon project/branch/
endpoint/retention, both recovery targets, signed witness and validity window.

The runner then opens its exact phase-specific least-privilege PostgreSQL
identity and executes only bounded BEGIN READ ONLY queries for schema
existence, user objects, actual migration role, default PUBLIC function
EXECUTE privileges, actual schema ownership, required stock-ledger objects
and exact recorded revision hashes. The resulting state is passed directly
to validate_phase() inside main(); no caller-supplied state is accepted.

- prepare-security: approved empty state with migration role absent.
- prepare-migration-owner: approved empty state, migration role present.
- migrate: approved empty state, migration role and global default ACL qualified.
- finalize-owner: exact six revisions, schema owner and expected objects.
- finalize-dba: exact six revisions, schema owner and expected objects.

After initial migration the database is NOT required to remain empty.
Existing independently guarded transaction-local preflights remain necessary
to block races between the read-only check and the commit.

## Non-circular Gate R and Gate A

A read-only verify-recovery-v2 runner phase can inspect live provider and
signed evidence without a final Gate A authorization. It never opens a
PostgreSQL connection or runs SQL. Its explicit result states
GATE_R_UNQUALIFIED and GATE_A_HOLD; this inspection does NOT authorize
resource creation or prove an independently witnessed real restore occurred.

Gate R requires a separate future human-approved preservation/backup/inventory/
isolated-restore resource authorization owned by Chat 13. Gate A can only be
assembled from completed actual Recovery V2 evidence and must bind exact
runner, validator, SQL package and manifest SHA-256 identities, named humans,
independent review and validity through the Gate A window.

## Source verification, unresolved blockers

Positive and negative tests include real synthetic Ed25519 signature
verification, wrong parent/LSN, production/staging overwrite targets, actual
provider TTL/expiry contradictions, altered dump and pg_restore list,
tampered inventory, absent or failed restore receipts, incorrect catalog/ACL
readback, stale provider results, unpinned human identity, changed validator
SHA and wrong Gate A evidence hash. Tests invoke actual runner main() and
prove all five mutation phases STOP on wrong live PostgreSQL state and that
failed provider or witness evidence prevents any SQL call.

No resource, branch, role, migration, backup/restore, company inventory,
database DDL or production deployment has been executed under 026.

Chat 13 must provide genuine Gate R preservation, custom dump, complete
inventories, independently witnessed both restores, custody and provider
retention evidence. Chat 10/11 must independently review this exact source
package and the corporate witness key and human-identity evidence before
a separate Gate A is even considered. Operational Gate R/Gate A and
technical production status remain NO-GO / HOLD.
