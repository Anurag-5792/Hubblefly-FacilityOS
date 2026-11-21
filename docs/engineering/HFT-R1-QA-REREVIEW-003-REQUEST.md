# HFT-R1-QA-REREVIEW-003 — Bounded independent Chat 17 request

**Directive:** HFT-R1-ENG-QA-CORRECT-002. **Mode:** read-only independent QA; REQUEST CHANGES remains in force.
**Source:** `Anurag-5792/Hubblefly-FacilityOS`, draft PR #11, `engineering/hft-r1-stores-foundation`.
**Exact review SHA:** use the immutable commit SHA in the `HFT-R1-ENG-QA-CORRECT-002-RESULT v0.1` handover and verify the GitHub branch before review. No floating SHA or uncommitted staging is acceptable.

## Bounded re-review matrix

- **QA-011 (HIGH):** Compare untouched source migration `db/migrations/0005_hft_quantitative_accounts_receipts.sql` SHA-256 `8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e` against separately versioned replacement `db/migration_candidates/0005_hft_quantitative_accounts_receipts_qa_corrected.sql`. Verify `UNIQUE(id,legal_entity_id)` on `hft.supplier_invoice` is declared *before* the child FK. Review `tools/hft_apply_migrations.py` for revision selection, old-v5 checksum refusal, concurrent-run and isolated-environment checks.
- **QA-012 (MEDIUM):** Review GRN line to GRN legal entity/invoice; invoice-line-to-item/invoice; receipt-to-GRN warehouse/location; material issue/return lines to scoped parents; original issue command to return line; stock command typed document, warehouse, site, item, location and lot/serial binding. Inspect declared foreign keys AND relevant transaction-locked triggers. Negative execution matrix in `tests/pg/hft_qa_correct_002_schema_negative.sql` is staged, not executed.
- **QA-013 (MEDIUM):** Review fresh-only 0005 preflight. It blocks stock, serial, custody, command, audit, GRN, approval, Hold, return and counting history instead of silently rewriting rows. Verify `receipt_scoped_location_v2` and `receipt_location_fk_v2` are validated on an empty installation. Historical schema tests must first seed a synthetic v4 database, assert corrected v5 is refused and verify all legacy rows remain byte-identical and no version 5 is recorded. Scripts are staged under `tests/pg/` but were not executed.

## Reviewer must not infer

- Source-level/synthetic passes are NOT PostgreSQL migration/ACID/concurrency acceptance.
- Missing operator attestation means neither the legacy 0005 application state of governed environments nor any conditional forward migration for an already applied 0005 is approved.
- A qualified production identity issuer, protected audit anchoring, reproducible dependency lock, full build, browser E2E, backup and MASTER stock authority are all unresolved.
- Do not recommend merge, production deployment, real data import or live posting under this request.

**Required response:** independent `ACCEPT / REQUEST CHANGES` by QA finding, precise files/lines and SHA, executable negative test evidence, remaining High/Critical blockers, production NO-GO.
