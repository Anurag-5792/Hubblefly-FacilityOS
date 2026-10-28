# HFT-R1-P1-QA-CORRECT-001-RESULT — Nonproduction source correction

**Date:** 28 October 2026. **Directive:** HFT-R1-P1-QA-CORRECT-001, existing HFT-R1-ENG-SCOPE-006 / AMENDMENT-002 authority.
**Repository:** `Anurag-5792/Hubblefly-FacilityOS`.
**Branch:** `engineering/hft-r1-stores-foundation`. **PR #11:** draft, unmerged.
**Reviewed parent:** `6a08d2bc7e1a79007b3234876f75d343cb1ad558`.
**Corrective code commit:** `57b0f5499e57460567d7951f6e20aa27580201ef`.
**Production:** NO-GO. **QA:** REQUEST CHANGES remains until independent re-review and real PostgreSQL qualification.

## Baseline and preservation
- Remote branch/PR were verified at the pinned reviewed HEAD before the leased source commit. The owner's KES checkout, local HEAD, and unpushed files are inaccessible from this container and remain UNKNOWN. No reset/force push/clean/stash, workstation installation or remote data write was attempted.
- MASTER's controlling evidence states HFT installation NOT STARTED and migration 0006 has not run on an authorized database. No governed PostgreSQL endpoint was available for independent database-history attestation. If a governed DB later reports the superseded digest, STOP: the migrator refuses it and requires a new approved forward revision; never silently reinterpret applied history.
- SQL versions 0001–0005 and rejected revision-0005 provenance remain unchanged. Accepted H4 stock-account identity immutability code remains byte-for-byte unchanged in migration 0006.

## Migration checksum and supersession
- **Original reviewed 0006 SHA-256:** `f6b92c89468b59b596dad6fa27453f78ccfeb3a2c578ed6d125cde54bbf5f371`.
- **Original 0006 Git blob SHA:** `583aa522035e1dba5be809277dc1e170a234e706`; content recoverable at functional P1 commit `1337414df00d2408e150a931c00c119652f894bf`.
- **Corrected canonical 0006 SHA-256:** `664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044`.
- `db/migrations/manifest.v1.json` pins corrected digest and retains 0001–0005. `tools/hft_apply_migrations.py` rejects the old 0006 checksum with `APPLIED_SUPERSEDED_0006_REQUIRES_SEPARATE_FORWARD_MIGRATION`. Never substitute hashes for an already-applied migration.

## Finding disposition (source-only)
- **P1-H3-01 HIGH — exact outcome binding:** `0006` now demands a one-to-one order-preserving mapping from two distinct persisted stock-entry PKs to exactly two outcome movements. It checks normalized bucket/sign/amount, command kind, immutable source document, actor, scope and custodian, canonical audit/outcome identity, and the **historical** available account balance/version captured into the immutable command seal when posting. `post-stock-command.ts` includes `available` and `accountVersion` in audit event. `stock-command-readback.ts` requires sealed post-state and invokes the database's full verification rather than trusting matched digests alone.
- **P1-H3-02 HIGH — read-only verification:** `hft.assert_command_seal_v1` is SELECT-only and does not acquire row/advisory locks. Posting and deferred-COMMIT paths independently acquire command/source/account/outcome locks through `hft.lock_seal_posting_dependencies_v2`. `tools/hft_verify_quantitative_accounts.sql` remains `REPEATABLE READ READ ONLY` and checks command and GRN invariants.
- **P1-H5-01 HIGH — accepted GRN quantities:** Deferred triggers reconcile each GRN-line accepted counter with the sum of uniquely identified posted receipt-command quantities; enforce authorized, QC-accepted, evidence-backed fragments and coherent GRN PARTIALLY_RECEIVED/RECEIVED state. Unposted receipt changes remain possible, posted receipt fields stay immutable. Invoice received reconstruction and accepted H4 triggers are preserved.
- **H4:** SOURCE ACCEPTED from Chat 17, unchanged; actual database qualification NOT RUN.

## Exact P1 corrective code/test paths (13)
1. `db/migrations/0006_hft_posted_fact_integrity.sql`
2. `db/migrations/manifest.v1.json`
3. `tools/hft_verify_quantitative_accounts.sql`
4. `tests/pg/hft_r1_posted_fact_integrity_negative.sql`
5. `tests/pg/hft_r1_p1_qa_outcome_negative.sql` (new)
6. `tests/pg/hft_r1_p1_qa_readonly_receive_issue.sql` (new)
7. `tests/pg/hft_r1_p1_qa_grn_partial_receipts.sql` (new)
8. `tests/test_p1_qa_correct001_contract.py` (new)
9. `tools/hft_apply_migrations.py`
10. `tests/test_migrator.py`
11. `lib/hft/persistence/post-stock-command.ts`
12. `lib/hft/persistence/stock-command-readback.ts`
13. `tests/unit/hft-commit-readback.test.ts`

## Tests actually executed
- `cd /mnt/data/hft_p1_qa_correct001_stage && python3 -m unittest discover -s tests -p 'test_p1_*.py' -v`: **13 PASSED, 0 FAILED, exit 0** on Python 3.13.5, isolated source staging. Original 0006 source is retained as local test fixture and compared byte-for-byte for H4 preservation. Staged 0006 digest matches the new manifest.
- Tests were run against a bounded reconstructed source subset; they are **not** a clean exact-commit checkout or full application acceptance. No initial failure was hidden: a static test regex was corrected and re-executed before commit.
- SQL fixtures **authored but NOT RUN:** duplicated/missing outcome movements, forged source/actor/action, fabricated available/version; actual committed RECEIVE and ISSUE verified inside READ ONLY REPEATABLE READ; GRN 5 ordered, posted partial 2, direct counter increase to 5 denied, separately posted 3 accepted, receipt immutability and status/invoice/account reconciliation.
- `tests/unit/hft-commit-readback.test.ts` contains targeted new synthetic tests; **NOT RUN** this turn. Full Node/typecheck/lint/build, PostgreSQL migrations, real COMMIT/rollback/concurrency/roles, and browser E2E are **NOT RUN**.

## Required next actions
1. One bounded independent Chat 17 re-review against the corrective code commit and affected dependencies, plus Chat 10 targeted DB integrity/posting-interface review where material.
2. After Chat 13 accepts an actual isolated disposable PostgreSQL environment and MASTER issues separate DB test authority, execute canonical 0001–0006, fresh/historical refusal, positive and negative SQL fixtures, read-only verifiers, concurrent custody/Hold/GRN/rollback and roles.
3. Continue existing Package 2 source engineering on the same branch after independent source defect reconciliation; don't duplicate posting authority.

**No merge, production deployment, real inventory, ERPNext posting or U-09 action. Production NO-GO.**
