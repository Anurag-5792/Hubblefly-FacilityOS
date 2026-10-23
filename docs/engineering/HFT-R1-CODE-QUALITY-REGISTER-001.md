# HFT-R1-CODE-QUALITY-REGISTER-001 v0.1

Baseline: main ae5d60909bbc6ec1b90e82ad5511351d55066977; donor cf5d45d1c5c1823e4a2d34dd3465bad9f37d9271.
Scope: read-only donor inventory; no dead-code removal. Classifications are provisional until reachability, runtime and independent review.

| ID | Exact legacy source | Classification | Dependency / action |
|---|---|---|---|
| CQ-01 | lib/auth/frappe-session.ts; lib/auth/server-guard.ts | REPLACE | Preview authentication bypass; production fail-closed adapter required |
| CQ-02 | lib/inventory-transactions.ts | REFACTOR | Preview-only transactions; retain UI validation, never use to post |
| CQ-03 | lib/inventory-workflows.ts; frappe_app/facility_os/facility_os/api/move.py | DEFER | Location-only move and preview count, preserve container workflows |
| CQ-04 | frappe_app/facility_os/facility_os/facility_os/doctype/facility_stock_balance/facility_stock_balance.json | DEFER | ERPNext synced projection, not standalone ledger; retain Phase 2 provenance |
| CQ-05 | frappe_app/facility_os/facility_os/api/documents.py | REUSE/REFACTOR | Existing GRN drafts and approvals; preserve historical records |
| CQ-06 | frappe_app/facility_os/facility_os/api/security.py | REPLACE | Global role-only guard; entity/site/warehouse checks required |
| CQ-07 | frappe_app/facility_os/facility_os/api/validation.py | REFACTOR | Count approvals; require all-stage SoD and version validation |
| CQ-08 | .env.example | REPLACE | Sample/preview defaults and ERPNext coupling; no production fallbacks |
| CQ-09 | package.json; .github/workflows/ci.yml | REFACTOR | Unlocked dependencies, npm install, missing meaningful tests |
| CQ-10 | lib/facility/sample-provider.ts; lib/mis/sample-provider.ts | DEFER | Demo read paths; inspect reachability before cleanup |
| CQ-11 | frappe_app/facility_os/facility_os/api/shopfloor.py | DEFER | Manufacturing historical genealogy; separate approved review |
| CQ-12 | frappe_app/facility_os/facility_os/facility_os/doctype/facility_operational_audit/facility_operational_audit.json | REPLACE for HFT R1 | No verified independent audit integrity; preserve records |

Current authorized change: new isolated secure authorization and exact fixed-point quantity contracts, with synthetic Node tests.
No legacy file was removed, copied or changed. No database writes, production operations or actual stock postings.
Outstanding: full dead-code reachability, duplicate call-graph, dependency CVEs, schema/runtime migration qualification, lint/type/build, independent architecture/security/QA reviews.

## HFT-R1-ENG-EXEC-FOLLOWUP-002 defect reproduction and corrective action (2026-10-23)

Source reference: `20a5ce022426b765a587e38e672dabc4f8d98a1e`.
- ENG-QA-001 HIGH, `lib/hft/domain/ledger.ts`: signed debit deltas incorrectly routed through unsigned quantity formatter. **REFACTOR** using `formatSignedQuantity`; retain `formatQuantity` for nonnegative balances.
- ENG-QA-002 HIGH, `lib/hft/domain/opening-stock.ts`: negative variance incorrectly routed through unsigned formatter. **REFACTOR** using signed representation for variances only.
- ENG-QA-003 HIGH test-evidence discrepancy, `lib/hft/domain/quantity.ts`: committed source lacked `requirePositive` export imported by GRN and ledger; source-matched tests reproduced 3 PASS and 2 test-file load failures. **REPAIR** export and add regression tests. Previous 23/23 local evidence does not qualify original HEAD.

Remediation: source-specific regression `tests/unit/hft-signed-ledger-regression.test.ts` covers RECEIVE→ISSUE→RETURN, conservation, replay, positive/zero/negative variances and Holds/SoD. Test evidence must be rerun against the new committed blob hashes; local checks before commit are provisional.

Open gates: no actual PostgreSQL instance, PostgreSQL migrations not executed, real transaction/concurrency/rollback/audit-outbox unproven; exact full checkout build/typecheck/lint, independent AI architecture/security/QA reviews, browser E2E and dependency audit outstanding. **NO-GO**.

## Isolated PostgreSQL transaction foundation (2026-10-23)

- `lib/hft/persistence/isolated-pg-transaction.ts` establishes **nonproduction-only** transaction control: explicit disabled live-posting flag, local disposable database name and role attestation, SERIALIZABLE transaction isolation, timeouts, rollback attempts and ambiguous COMMIT handling.
- `tests/unit/hft-isolated-pg-contract.test.ts` tests this envelope with a *synthetic fake client*, including invalid environment, successful sequence, rollback, wrong database, uncertain COMMIT and lost BEGIN response.
- This is **NOT** a stock posting implementation. No database SQL migrations, persisted balances, employee custody, audit-outbox, Holds, or concurrency were actually tested against PostgreSQL.
- Dependency blocking integration: PostgreSQL server/psql executable/isolated database are absent in current execution container, and application dependencies are not installed. Build/lint/fully clean Git checkout pending.
- Before the next bounded implementation: deploy a disposable PG15+ service under authorized local control, install pinned adapter, run migrations and real-db positive/negative and concurrency tests; obtain independent architecture, security and QA review.
- Security limitation: environment variables and database naming conventions are preflight checks, not authorization for live use or proof of infrastructure identity. Production remains NO-GO.
