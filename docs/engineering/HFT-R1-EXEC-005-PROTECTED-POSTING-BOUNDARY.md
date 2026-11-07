# HFT-R1-ENG-EXEC-005 — Protected posting boundary (NONPRODUCTION)

Status: **NOT DATABASE QUALIFIED / DO NOT EXECUTE PROPOSAL SQL**.

The only executable migration series is exactly the pinned
`db/migrations/manifest.v1.json` list (0001–0005). The original invalid
0005 has been archived in `db/provenance` with SHA-256 preserved.

The file `db/security/HFT-R1-APPROVAL-AUTHORITY-NONEXECUTABLE-CANDIDATE.sql`
is intentionally OUTSIDE migration discovery and is **not** a new migration.
Do not run it manually. It contains a provisional bound approval schema,
Hold/policy generations, source revision invalidation and a BEFORE INSERT
posting gate. It has NOT passed PostgreSQL compilation, privilege, trigger,
historical-data or concurrent-request qualification.

The role script `db/security/HFT-R1-DISPOSABLE-ROLE-BOOTSTRAP-REVIEW.sql`
is likewise a proposal requiring separate operator/DBA review. It proposes
migration-owner, non-login runtime group and read-only audit group separation,
but until SQL privileges are exercised and denied-role DML checked, this is not
evidence of protection. Existing TypeScript stock adapter still requires
DML and is NOT permitted to use the protected runtime role. A separately
reviewed, constrained single database posting function is required.

The new `lib/hft/security/approval-binding.ts` contract and six targeted
synthetic unit tests reject an issue increasing from 2 to 4 against the same
approved-payload hash, stale policy generation, source revision mutation and
forged operator. They do NOT prove real database enforcement, authenticated
per-employee SQL login binding, or independent human approval.

Required before accepting QA-012A/QA-012B/QA-014:
- Review and version the proposed protection SQL as a forward migration.
- Implement and qualify the single SECURITY DEFINER posting procedure.
- Prove runtime is NOT table owner, has NO DML/TRIGGER/DDL rights, and
  cannot forge actor identity using SQL session variables.
- Exercise `tests/pg/hft_r1_direct_dml_negative.sql` on a disposable DB,
  including direct unauthorized but balanced stock-entry attempts.
- Exercise real PostgreSQL GRN, issue, return, concurrent Hold/approval
  races, audit readback, rollback and ambiguous COMMIT tests.
- Separate independent security/architecture/QA reviews and MASTER GO.

No production host, database access, U-09 action or live stock authority
is authorized by this source.
