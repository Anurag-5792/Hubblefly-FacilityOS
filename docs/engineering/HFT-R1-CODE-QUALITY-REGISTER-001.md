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
