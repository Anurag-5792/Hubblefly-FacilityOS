# C037 — Portable S0–S5 catalog fingerprint and target-local OID integrity

Directive: `HFT-R1-MASTER-V3-C035-OID-PORTABILITY-CORRECT-037`  
Date: 4 November 2026  
Mode: **NONPRODUCTION SOURCE ONLY**; PostgreSQL/Neon resource execution **HOLD**; production **NO-GO**.  
Starting reviewed commit: `6fc4c7887b40d5c15b83ba63b042915a6be99cd3`.  
Existing branch and draft PR #11 only; no migration, approval pin, recovery or inventory change.

## Portable reference: V2 (all six stages)

`tools/hft_c028_catalog.py` defines:

- `PORTABLE_STAGE_SCHEMA = HFT_R1_BOOTSTRAP019_PORTABLE_CATALOG_V2`.
- `portable_semantic_catalog(observed)` checks **all 30 categories**, then removes only cluster-local identity fields from `role_census` and `role_membership_census`. No role, grant, privilege or category is filtered out.
- Role name (`id`), LOGIN, INHERIT, SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, connection limit, expiration, settings, and other existing semantic attributes are retained.
- Membership identity is a canonical JSON string of `[member_name, granted_role_name, grantor_name]`. Grantor and ADMIN/INHERIT/SET options, plus endpoint security attributes remain in the digest. Duplicate semantic role/grant identities are rejected.
- `portable_stage_hash = SHA256(UTF8(canonical JSON + newline))`, where canonical JSON uses sorted keys, compact separators and lexicographically ordered record IDs. The hashed object contains `schema=HFT_R1_BOOTSTRAP019_PORTABLE_CATALOG_V2` and all normalized categories.
- `verify_stage`, `verify_prebootstrap` and `verify_postcanonical` use the new portable digest. The latter two are **legacy source helpers, not phase authorization paths**.
- Stage-reference bundle schema changes from `HFT_R1_BOOTSTRAP019_PHASE_REFERENCE_V1` to `..._V2` and binds the portable, physical-evidence and continuity schema versions, six distinct stage pins, protected SQL identities and canonical migration manifest.
- Real runner authorization now requires `HFT_R1_MASTER_V3_BOOTSTRAP019_EXEC_AUTH_V2`. The preexisting exact runner, collector, Recovery V2, manifest and protected-SQL hashes remain required. V1 authorization cannot be reused.

A role's numeric OID and membership's raw OID-composite record ID **never** participate in a portable stage digest. Two independently constructed clusters with identical named security semantics and different internally consistent role OIDs can share one independently qualified stage reference. This is **not** authorization to reuse a cluster-local continuity record between them.

## Raw cluster-local evidence and fail-closed integrity

`validate_oid_evidence` validates a complete `pg_roles` and `pg_auth_members` observation from one C032 repeatable-read read-only snapshot:

1. All observed role OIDs are nonzero uint32 numeric text, and role names/OIDs are unique and one-to-one.
2. Every explicit member, granted-role and grantor numeric OID resolves to its claimed role name.
3. Each membership's raw `id` exactly matches its constituent OIDs; semantic membership tuples are unique.
4. Login, inheritance, privilege-bearing and delegation attributes match the associated role records; missing/malformed/conflicting observations are rejected before hashing or mutation.
5. The special `pg_database_owner` owner relationship remains **implicit**, not synthesized as an explicit catalog grant.

`raw_oid_evidence` returns a separate versioned representation (`HFT_R1_BOOTSTRAP019_CLUSTER_OID_EVIDENCE_V1`) containing the complete role-name-to-OID map and explicit grants with local OIDs and options. It is **not** part of the portable stage SHA.

For a catalog collection, `collection_id` is the SHA-256 of a canonical evidence envelope including the collector source SHA-256, target branch, database and SQL user, PG version, backend PID, snapshot identity, complete SQL transport SHA-256, raw-OID representation SHA-256, portable stage SHA-256, and phase/revision evidence SHA-256. The runner records the full raw evidence in a separately identified `role_oid_forensic_observation` journal event **before** any mutating SQL, validating the raw-evidence SHA again. Failed recording aborts the operation.

The journal is local source evidence, **not an immutable archive, independent witness attestation, a signature, or a substitute for protected custody**. Independent retention, integrity, original-byte provenance and witness qualification remain separate release dependencies. No real OID history has been collected or approved by C037.

## Same-cluster role continuity and approval binding

The runner requires `--role-continuity-evidence` for every mutating phase and final S5 verification. It fails closed if the file is missing, malformed or inconsistent with the exact target and stage.

The source-defined `HFT_R1_BOOTSTRAP019_ROLE_CONTINUITY_V1` artifact includes the exact project, branch and database, the intended stage, preceding target-local stage, previous qualified collection SHA-256, independent witness evidence SHA-256, exact collector source SHA-256 and complete prior name-to-OID map.

- S0 requires an independently qualified **S0 baseline anchor** for that same target. There is no automatic `first-run trust` or self-issued history.
- S1 compares all existing identities against the preceding S0 anchor and permits only the five HFT roles created by the protected bootstrap SQL as new identities.
- S2–S5 compare every named role to the preceding target-local anchor; unqualified newly created/removed/recreated roles fail closed.
- A changed OID for an existing same-name role is rejected even if its portable semantic stage fingerprint is unchanged.
- The versioned Gate A authorization artifact includes `role_continuity_evidence_sha256`. Its approved byte-exact hash must equal the supplied continuity artifact before database mutation. The remaining review, recovery, source, stage and SQL hash bindings are not relaxed.

The code checks *internal integrity and authorization-file hash binding*. It does **not** cryptographically verify the external witness document merely by reading its SHA-256 field. The external provenance and human witness must be qualified independently; invented, missing or unqualified history is not acceptable for Gate A. All real approval/reference pins remain `HOLD`.

## Acceptance boundary and limits

Synthetic source tests verify OID renumbering equivalence across S0–S5, stable role OIDs within a target, changed role/grant semantics, direct/transitive predefined-role paths, ADMIN/INHERIT/SET/grantor changes, duplicate and contradictory OIDs, broken membership record IDs, stale reference/auth schemas, target mismatch, missing history, mutation prevention and raw journal binding.

The C032 one-backend `REPEATABLE READ READ ONLY` SQL collection and phase/revision observations have **not been redesigned**. Its connection identity and transactional mutation-side controls remain in place. A read-only snapshot alone does not eliminate execution-time TOCTOU; the separate protected SQL preflight and transaction-local locks remain mandatory.

Still unverified: actual PostgreSQL 18.6 syntax/semantics, real reference-vs-Neon compatibility beyond synthetic OID assignment, independently witnessed baseline and continuity data, collector/witness trust, signed recovery, Gate R and Gate A. Do not populate stage references, alter Neon roles or resources, merge PR #11 or deploy production.
