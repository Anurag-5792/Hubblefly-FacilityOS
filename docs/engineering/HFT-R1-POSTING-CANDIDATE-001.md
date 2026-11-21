# HFT-R1-POSTING-CANDIDATE-001 — Nonproduction persistence contract

Status: **UNQUALIFIED PROTOTYPE CANDIDATE / NOT AUTHORITATIVE STOCK**. This document is engineering evidence, not a MASTER Phase 1 stock-authority amendment.

## Integration

- PostgreSQL >=15; new SQL migration `0004_hft_posting_authority.sql` depends on unmodified `0001`–`0003`.
- `tools/hft_apply_migrations.py` is a guarded external-`psql` runner; migration revisions are content-SHA-256-verified and wrapped with revision insertion in one transaction. A fresh disposable PostgreSQL database is mandatory. A PostgreSQL server was **not available** in this execution environment, and SQL has not been executed against one.
- `lib/hft/persistence/post-stock-command.ts` accepts a server-bound operator marker **only in ISOLATED_TEST_ONLY mode**; no public API or production identity provider is wired.
- `withIsolatedPgTransaction` enforces SERIALIZABLE, timeouts, local disposable database name/role attestation and explicit disabled live posting.
- Domain business rules remain in `applyCommand`; DB adapter loads trusted read state and persists the domain result inside a single transaction. It does not call external ERPNext services.
- Before posting, adapter acquires an entity/site/warehouse posting-gate advisory lock. SQL triggers on grant, Hold and approval mutations take the same lock. Account-scoped advisory lock serializes balance changes; database uniqueness, row locks and SERIALIZABLE are additional defenses.
- Server-stored actor/permission, approval/inspection, and active blocking Holds are loaded in the same transaction. GRN / partial-receipt and issue / return source documents are locked and checked; return is linked to original issue source document.
- Stock account, ledger entries, custody, serial registry, documented outcome and audit-outbox event are all written in one transaction. A deferred SQL constraint requires at least two balanced legs per command and exactly one persisted outcome/outbox/delivery entry.
- DB command fingerprint and source-action uniqueness guard duplicate postings. A duplicate identical command replays persisted outcome; a changed payload or duplicate source action is rejected. An uncertain COMMIT is reported as uncertain; client must reconcile before retry.
- Audit outbox is NOT a certified independently protected audit-integrity boundary. It remains pending separate W11/W13 qualification.

## Specific limits and release blockers

1. **No database evidence:** `psql`, server and Docker are unavailable, so transactions, SQL syntax, migration locks, row-lock ordering, deferred constraints and actual concurrency are unverified. Source contract/typecheck and synthetic protocol tests are not substitutes.
2. **No verified authentication adapter:** operator trusted marker is not a cryptographic or session-attested human identity; service has no HTTP endpoint and MUST NOT be exposed.
3. **No production stock authority:** no Phase 1 system-of-record amendment and no live post gate; fixed explicit disabled mode only.
4. **No production-ready receipts:** one QC-accepted partial fragment per command (`source_action_key=receipt_key:line_no`), one material-issue document per ISSUE posting. Multi-line material issues, registered GRN attachment validation, on-hand opening cutover, and cost/accounting rules remain incomplete.
5. **Locations:** account adapter currently uses an empty `location_key`; rack/bin-level quantitative location tracking requires separate design and tests.
6. **Roles/SQL grants:** isolated DB role and least-privilege DDL grants require independent review. Migration runner rejects superuser and nonlocal/non-disposable target but cannot cryptographically prove the physical host.
7. **Serial/batch:** executable contract exists in domain and SQL candidate, but actual concurrent-serial and batch registration tests are outstanding.
8. **Security:** audit event text hash is locally computed; not independently anchored. Hold and approval mutation triggers must be validated under concurrent real transactions. Return inspection and source-document version must be independently verified.
9. **Build:** exact npm lockfile unavailable due blocked registry; full checkout build, lint, browser E2E and vulnerability scanning not qualified.
10. **Recovery:** rollback is covered only by scripted driver tests; real crash, commit uncertainty, restore and PITR not qualified.

Next qualified step: provide disposable PostgreSQL >=15, client `psql`, non-superuser `hft_engineering`, database matching `hft_r1_disposable_*`, trusted local session/credentials supplied through a secret store, and a working dependency registry/cache. Then run migration+real-db tests, independently inspect exact commit, and report actual evidence. No deployment or production access authorized.
