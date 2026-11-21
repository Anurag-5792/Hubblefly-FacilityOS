# HFT-R1-ENG-QA-REMEDIATION-001

**Directive:** HFT-R1-ENG-QA-CORRECT-001  
**Mode:** Authorized **NONPRODUCTION** engineering; no merger, production deployment, or actual stock authority  
**Base reviewed source:** `38cccd94b60e6d47ba171f8e73c0e87d633596a0`  
**Status:** CORRECTIVE SOURCE IMPLEMENTED; **REAL DATABASE QUALIFICATION BLOCKED**; independent QA re-review not yet performed

## Finding-to-correction traceability

| QA finding | Exact correction | Regression evidence | Remaining qualification |
|---|---|---|---|
| QA-001 — custody leg mapped to AVAILABLE | `lib/hft/persistence/account-model.ts` derives bucket-specific account identity; `post-stock-command.ts` writes actual `CUSTODY` account IDs distinct from `AVAILABLE` | `tests/unit/hft-account-reconstruction.test.ts`, `hft-account-posting-protocol.test.ts` | Execute same sequence on genuine PostgreSQL |
| QA-002 — missing quantitative custody accounts | `db/migrations/0005_hft_quantitative_accounts_receipts.sql` adds account kind + custodian + location into uniqueness and balanced journal reconciliation | Same as above; schema contract tests | Run DDL and concurrency on an authorized disposable PG database |
| QA-008 — aggregate-only readback | `stock-command-readback.ts` compares each durable stock entry to expected bucket/account ID/scope and queries a materialized-versus-journal reconstruction view | `tests/unit/hft-commit-readback.test.ts` explicitly rejects balanced-but-wrong-account results | Real database readback + audit provenance test |
| QA-003 — location hardcoded empty | `StockCommand.locationId`, location-scoped stock account, database FK, server `hft.location` active check, issue/return origin binding | `hft-account-reconstruction.test.ts` unlocated/alternate-bin negative | Real different-location posting tests |
| QA-004 — weak GRN/item/lot/serial/approved quantity binding | `post-stock-command.ts::loadDocument` locks verified supplier invoice, QC receipt, GRN/invoice lines; enforces item/location/batch/serial/quantity, line caps; inserts durable receipt and line reference | `hft-account-posting-protocol.test.ts`; migration contract tests | Real GRN invoice/line/serial/batch transactions and attachment integrity review |
| QA-009 — supplier-invoice uniqueness blocked partial GRNs | migration introduces one verified invoice with global line quantity caps, multiple distinct physical GRNs/receipts, unique receipt per supplier and unique source posting | Partial/full-invoice synthetic negative test; schema contract | Real concurrent receipts and cumulative recon across 2 GRNs |

## Account lifecycle and quantities (SYNTHETIC EXPECTATIONS ONLY)

| Step | AVAILABLE | EMPLOYEE CUSTODY | DAMAGED | Total company-owned |
|---|---:|---:|---:|---:|
| RECEIVE 5 | 5 | 0 | 0 | 5 |
| ISSUE 2 | 3 | 2 | 0 | 5 |
| RETURN GOOD 1 | 4 | 1 | 0 | 5 |
| RETURN DAMAGED 1 | 4 | 0 | 1 | 5 |

The table above is asserted with the in-process exact fixed-point model and scripted SQL adapter. **It is not a PostgreSQL result.** The independent real-database reconciliation script is `tools/hft_verify_quantitative_accounts.sql`; no database output exists yet.

## Migration safety

- New additive migration: `db/migrations/0005_hft_quantitative_accounts_receipts.sql`.
- **No byte changes to** migrations 0001–0004; existing recorded migration checksums remain meaningful.
- Migration detects pre-existing wrongly attributed CUSTODY facts or unlocated legacy accounts and raises a manual-reconciliation error rather than silently reallocating them.
- A deferred PostgreSQL trigger validates each account's balance against journal legs at COMMIT, and a second trigger validates invoice-line cumulative receipts. All still require **real server execution**.
- No historical physical receipts, audit evidence or stock facts were deleted or rewritten.
- Contract fingerprint and canonical audit schema advance to `HFT_STOCK_COMMAND_V2` / `HFT_STOCK_EVENT_V2` for changed account/location semantics.
- Entity warehouse and location FKs, plus verified supplier-invoice line references, are mandatory on new postings.
- Company ownership persists through internal AVAILABLE → CUSTODY → DAMAGED/WIP/INSTALLED transitions; EXTERNAL is a governed boundary, not an owned account.

## Executed local source checks (23 October 2026)

- `node --experimental-strip-types --test tests/unit/*.test.ts`: **60 PASS / 0 FAIL** on local staged source.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: **3 PASS / 0 FAIL** on local staged source (migration tool contract, not executed DDL).
- `tsc --noEmit --strict ...`: **exit 0**, affected TypeScript domain/security/persistence/tests only, using local temporary Node type definitions.
- `npm ci --offline --ignore-scripts`: **exit 1**, missing `package-lock.json`; `npm run verify:lock`: **exit 1** by design.
- `npm run build`: **exit 127**, Next unavailable; `npm run lint`: **exit 127**, ESLint unavailable.
- `python3 tools/hft_apply_migrations.py` with explicit synthetic isolated environment: **exit 1**, `PSQL_TOOL_NOT_AVAILABLE`.

All source test evidence must be repeated from a clean checkout of the final exact commit as part of qualification.

## Unresolved risk / blockers

1. No real PostgreSQL 15+ disposable host, migration execution, concurrent ISSUE, transaction rollback, DB idempotency, serial collision or custody ledger reconstruction results.
2. Dependency lockfile and full Next.js lint/typecheck/build still missing; browser E2E not executed.
3. Production identity issuer, revocation, database least-privilege/RLS, real CQ/QA and independent security review, U-09 governance, stock authority amendment and backup/restore unqualified.
4. Deferred migration constraints for already existing legacy receipt rows require historical reconciliation and explicit validation before accepting any pre-existing data.
5. Single source location per issue/return; cross-bin return requires a separately governed location transfer before broader production use.
6. Independent Chat 17 re-review must assess exact committed SHA, migration SQL semantics and tests. Self-check is not an independent approval.

**Recommended disposition: REQUEST CHANGES until independent architecture/security/QA review and actual PostgreSQL qualification; production NO-GO.**
