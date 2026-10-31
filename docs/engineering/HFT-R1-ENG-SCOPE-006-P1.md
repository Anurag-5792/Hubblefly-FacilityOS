# HFT-R1-ENG-SCOPE-006-P1 — Immutable posted facts

**Report:** 28 October 2026. **Authority:** HFT-R1-MASTER-ENG-SCOPE-AMENDMENT-002.
**Repository:** `Anurag-5792/Hubblefly-FacilityOS`.
**Existing branch:** `engineering/hft-r1-stores-foundation`; **Draft PR #11** (do not merge).
**Parent:** `b89b370bc57e9a42ad52ec0b63cb127abaaba18c`.
**Functional code commit:** `1337414df00d2408e150a931c00c119652f894bf`.
**Mode:** NONPRODUCTION SOURCE-ONLY. **Production:** NO-GO.

## Reconciliation
- Remote HEAD and PR #11 both matched the pinned parent immediately before the leased source commit. No new branch, overwrite, force-push, reset, stash or checkout replacement.
- This execution container has no FacilityOS Git checkout; **the owner's KES local HEAD and any unpushed work are UNKNOWN**. Require a read-only KES status/custody comparison before integrating the remotely committed changes with the owner's local work. Preserve any concurrent source.
- No MSI/Windows installation, PostgreSQL migration, real company data import or production action performed.

## Implemented P1 source
- **H3:** `db/migrations/0006_hft_posted_fact_integrity.sql` seals exactly two kind/quantity/signed movement legs, requires a sealed command at COMMIT, rejects post-seal append, persists a hash of ordered immutable legs plus outbox/outcome digests. The posting adapter now supplies typed `quantity_micro` and seals in the same transaction; readback requires a correct immutable seal.
- **H4:** full stock-account identity immutable under BEFORE UPDATE/DELETE; changing owner, warehouse, location, item, lot/serial, condition, kind or employee custodian is prohibited.
- **H5:** posted physical receipt is immutable; referenced GRN/invoice header and line identity fields freeze, while legitimate counter/status updates and unposted receipt changes follow the existing workflow.
- `tools/hft_verify_quantitative_accounts.sql` expands account/entry/source/audit/reconstruction checks. Canonical manifest pins SHA-256 of v6; migration runner and offline tests now require six revisions.

## Changed source paths (P1 code commit)
1. `db/migrations/0006_hft_posted_fact_integrity.sql` — new.
2. `db/migrations/manifest.v1.json`.
3. `lib/hft/persistence/post-stock-command.ts`.
4. `lib/hft/persistence/stock-command-readback.ts`.
5. `tools/hft_apply_migrations.py`.
6. `tools/hft_verify_quantitative_accounts.sql`.
7. `tests/test_migrator.py`.
8. `tests/test_p1_migration_contract.py` — new.
9. `tests/pg/hft_r1_posted_fact_integrity_negative.sql` — new.
10. `tests/pg/hft_r1_posted_fact_shapes_negative.sql` — new.
11. `tests/unit/hft-account-posting-protocol.test.ts`.
12. `tests/unit/hft-commit-readback.test.ts`.
13. `tests/unit/hft-postgres-posting-contract.test.ts`.

**0006 SHA-256:** `f6b92c89468b59b596dad6fa27453f78ccfeb3a2c578ed6d125cde54bbf5f371`.
All original 0001–0005 and rejected-0005 provenance digests preserved.

## Evidence
- **Executed offline test:** `cd /mnt/data/hft_p1_stage && python3 -m unittest discover -s tests -p 'test_p1_migration_contract.py' -v` — 6 passed / 0 failed, exit code 0. Isolated temporary staging with precisely checked new 0006/manifest/test bytes; **not full exact-commit application CI**.
- **Author-only:** PostgreSQL negative fixtures for valid committed RECEIVE, extra balanced legs, immutable account identity, posted receipt mutation, wrong-sized/extra/missing/wrong-bucket movements, and deferred-constraint enforcement. **No real PG execution.**
- **NOT RUN:** Existing full Node suite, full TypeScript/lint/build, real PostgreSQL migrations, account/custody integration, concurrent Holds, KES host qualification, browser E2E, backup/restore, independent Chat 17/security review of P1.
- **Dependency gate:** Authentic `package-lock.json` not yet present; no npm installation under this authority. Production denial remains unchanged.

## Open conditions
- H3/H4/H5 = source implemented / independent PostgreSQL acceptance pending, NOT CLOSED.
- H1/H2 = OPEN, Package 2 must implement one protected writer, persisted approval and signed actor mapping; the current test adapter still uses migration-role DML.
- G1–G4 = OPEN. Real DB work awaits Chat 13 accepted environment and separately granted migration/testing authority.
- P2 must implement mandatory partial ISSUE and RETURN fragments and idempotent custody under the approved single-writer contract.

**Next engineering work:** bounded independent review of code commit, then Package 2 source work on the same PR under existing authority. No production GO.
