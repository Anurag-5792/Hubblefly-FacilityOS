# HFT R1 QA-CORRECT-002 — Migration replacement and historical cutover safety

**Status: NONPRODUCTION CANDIDATE ONLY / NOT RUN ON POSTGRESQL.**

## Why old 0005 is immutable

The old 0005 SQL SHA-256 is `8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e`. Its FK `(invoice_id, legal_entity_id)` has no exact matching parent unique key and would fail a normal fresh PostgreSQL install. There is no authenticated database inventory confirming that no governed environment applied v5, so the original source file has NOT been changed. It remains available for provenance.

For a **new, authorized disposable database** only, `tools/hft_apply_migrations.py` verifies the original file SHA before choosing the separately immutable `db/migration_candidates/0005_hft_quantitative_accounts_receipts_qa_corrected.sql` as revision 5, computes that candidate's SHA-256 and records its digest atomically. It verifies previous 0001–0004 digests unchanged. If the old v5 SHA is recorded, it stops with `APPLIED_LEGACY_0005_REQUIRES_SEPARATE_FORWARD_MIGRATION` — no rewriting the revision ledger or old inventory. A governed historical environment requires a separately approved additive forward-only versioned migration and independent record reconciliation.

## QA-012 / QA-013 constraints

The candidate introduces scoped composite parent keys and child foreign keys for invoice and GRN, issued line, returned line, physical location and typed command source; per-command triggers reject document or parent mismatches. To prevent unexamined historical mutations, candidate 0005 aborts if it finds operational inventory, serial, custody, GRN, issue/return, stock command, Hold, approval, audit or counting rows. It does not invent `UNRECONCILED-*` delivery identifiers or recategorize existing custody quantities. Any operational history requires separately governed entity-by-entity reconciliation.

## Separate disposable database test jobs (NOT YET EXECUTED)

1. **Fresh job:** create private loopback PostgreSQL >=15 disposable DB and non-superuser role `hft_engineering`. Configure exact existing fail-closed isolated HFT environment variables and secrets outside the repository. Run `python3 tools/hft_apply_migrations.py`. Archive server version, role, each SHA-256 and `tools/hft_qa002_constraint_catalog.sql` output. Run `psql -X -v ON_ERROR_STOP=1 -f tests/pg/hft_qa_correct_002_schema_negative.sql`, which rolls back all fixture writes. Also run real posting-service integration, concurrent over-receipt and issue, rollback, idempotency and audit checks; no real runner or successful evidence exists today.
2. **Historical job:** create a **different** new disposable database. Apply only revisions 0001–0004, execute `tests/pg/hft_qa_correct_002_historical_fixture.sql` to commit a synthetic legacy GRN. Attempt corrected v5 via the controlled migrator; expected to fail. Run `tests/pg/hft_qa_correct_002_historical_assert.sql` and verify retained GRN and no v5 revision. Destroy the test database after collecting evidence; do not reuse it as a production or UAT data source.
3. **Already-applied legacy v5 job:** if a governed environment reports the old v5 SHA, stop. This branch cannot safely retrofit constraints, normalize historical rows or rewrite the applied digest. Bring a separate additive migration design and precise operator snapshot to MASTER before further writes.

## Unresolved quality gates

The current execution environment has no `psql` or authorized PostgreSQL host. No catalog result, SQL success, account reconstruction, commit uncertainty or real database transaction PASS is claimed. Dependency lock, clean installation, lint, full build, security, QA and recovery gates remain open. Preserve `NO-GO`.
