# C030 — Exact BOOTSTRAP-019 phase transitions

Directive HFT-R1-MASTER-V3-C028-PHASE-TRANSITION-CORRECT-030.
Starting HEAD eb8a524bafdc4ab8ddc67ebce280ce4cd9ddb8b4.
Mode SOURCE-ONLY. Neon DDL, branch creation, restore and migrations HOLD.
Production NO-GO. Draft PR #11, same engineering branch.

## Root cause corrected

C028 verified one all-empty prebootstrap catalog after restricted HFT roles
were already legitimately created. It also reused one catalog hash across
three materially different post-0006 ACL states. Neither could qualify a
real, sequential PostgreSQL migration.

## Exact state matrix

| State | Next permitted phase | Required evidence |
|---|---|---|
| S0 | prepare-security | Clean approved public baseline, NO HFT roles, memberships, objects, unapproved privileges or altered defaults |
| S1 | prepare-migration-owner | Exactly restricted role and membership identities produced by DBA-ROLE-NONEXECUTABLE.sql, actual database/schema grants; no HFT objects or global FUNCTION default change |
| S2 | migrate | Exactly S1 plus creator/default PUBLIC EXECUTE restrictions from CREATOR-ACL-NONEXECUTABLE.sql; no unauthorized objects/grants |
| S3 | finalize-owner | Exactly six canonical revision hashes and complete pre-owner-close catalog/privileges |
| S4 | finalize-dba | Same six canonical revisions and objects; only approved changes from OWNER-CLOSE-NONEXECUTABLE.sql |
| S5 | final read-only verification | S4 plus approved DBA-CLOSE-NONEXECUTABLE.sql database/PUBLIC restrictions and sealed final catalog |

The real runner maps its five mutating phases to S0 through S4 and
verify-final-dba to S5. Each phase uses actual PostgreSQL READ ONLY catalog
and revision queries; there is no user-provided phase label.

The complete existing C028 24-category catalog collector remains authoritative:
schemas, relations, column definitions, sequence allocation parameters,
functions/procedures, triggers, constraints, indexes, policies, extensions,
roles, memberships, effective relation/function/sequence/schema/database
grants, types, rules, event triggers, publications, operators, collations
and actual creator default privileges.

The catalog module derives exact expected restricted HFT role names and
membership edges from the existing reviewed DBA-ROLE-NONEXECUTABLE.sql,
verifies restricted role/membership flags, and verifies that the creator
default restrictions appear only after the authorized creator phase.
S3, S4 and S5 require exact immutable 0001–0006 revision hashes and
full pinned catalog identity. Extra, missing or altered objects or
permissions fail closed. Cross-stage reference reuse is forbidden.

## Independent reference/authorization holds

Six separate reference files config/hft-bootstrap019-stage-s0.sha256
through config/hft-bootstrap019-stage-s5.sha256 are ALL HOLD. They must
later be populated from independently reviewed PostgreSQL 18.6 reference
executions, each using exact approved DBA security, creator, canonical,
owner-close and DBA-close source with independent provenance/custody.

The Gate A signed artifact now binds phase_reference_bundle_sha256:
the canonical manifest SHA-256, ALL six distinct approved stage SHA-256
fingerprints, and the SHA-256 of each of the four reviewed transition SQL
files. It continues to bind the runner and recovery/catalog collector
source hashes. A changed SQL file, stage reference or source code
invalidates any existing Gate A artifact. Missing HOLD references block
execution AND the final S5 verification. The former single C028 post-v6
hash remains HOLD but cannot be substituted for any staged reference.

## Source-only regression and no mutation

The new test_hft_c030_phase_transitions.py uses deterministic simulated
PostgreSQL SELECT responses but REAL collect(), verify_stage(),
live_database_phase_state() and staging runner main(). The classifier
is NOT mocked. All mutating SQL is an exception sentinel; no DDL is run.

Positive: S0 then prepare-security, S1 then prepare-migration-owner, S2
then migrate, S3 then finalize-owner, S4 then finalize-dba, and S5
independent final readback.

Negatives: extra/missing roles, memberships and grants; elevated role;
default/PUBLIC EXECUTE or database CREATE drift; rogue functions/objects;
column/sequence changes; missing HOLD or wrong stage reference;
source SQL hash drift; stale Gate A phase-reference bundle; skipped,
repeated and premature phases; any mismatched phase reaching mutation.
These are synthetic tests, NOT a witnessed PG18.6 execution.

## Historic Preview read-only discovery qualification

An earlier authorized Vercel Preview discovery connected READ ONLY
over certificate-verified client TLS to Neon PostgreSQL 18, reported
connected=true, tlsVerified=true, readOnly=true,
backendTlsVisible=false behind Neon's proxy, and confirmed missing
hft.schema_revision, ledger and protected writer. No DDL, role creation,
posting or data mutation took place in that discovery. The current
Preview discovery guard defaults DISABLED unless an explicit reviewed
read-only attestation approval is supplied. C030 performs NO Neon access.

The canonical 0001–0006 migrations and their source hashes, local-only
migrator, one authoritative stock ledger, Recovery V2 signature controls,
PG role/ACL boundaries and atomic migration/no-retry are unchanged.

## External gates still OPEN

Independent PG18.6 reference capture and six stage approvals; actual
Gate R preservation/dump/restore and independently verified human
witness; trusted collector and witness public-key enrollment; Gate A
authorization; Chat 10/11 bounded independent re-review and Chat 17
production acceptance. All HOLD pins remain HOLD. Production NO-GO.

