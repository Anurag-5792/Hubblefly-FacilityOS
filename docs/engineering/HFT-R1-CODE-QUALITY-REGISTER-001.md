# HFT-R1-CODE-QUALITY-REGISTER-001 — Initial bounded register

Status: OPEN; NOT a claim that repository-wide static analysis has completed. Based on the complete Git tree and individually inspected files at legacy SHA cf5d45d1c5c1823e4a2d34dd3465bad9f37d9271. No legacy or main file deleted. Independent technical review pending.

| ID | Exact legacy source | Category | Finding / dependency | Action | Disposition |
|---|---|---|---|---|---|
| CQ-001 | lib/auth/frappe-session.ts::authSource, previewSession | Insecure default | Defaults to preview identity; old UI preview depends on it | REPLACE | New R1 boundary blocks production; legacy unchanged |
| CQ-002 | lib/auth/server-guard.ts::authorizeFacilityRequest | Authorization bypass | Role restriction only in Frappe mode; API routes depend on guard | REPLACE | R1 scoped authorization contract; adapter still required |
| CQ-003 | lib/inventory-transactions.ts::previewInventoryTransaction | Preview-only | Explicit PREVIEW_ONLY, no stock posting | REUSE | Keep validation concept only; no promotion to production mutation |
| CQ-004 | lib/inventory-workflows.ts::validateMove,validateCount | Preview-only | Not authoritative transfer/count; used by routes | REFACTOR | Defer removal pending legacy workflow tests |
| CQ-005 | frappe_app/facility_os/facility_os/api/documents.py::save_document,transition | Overlap / coupling | Frappe doc workflows/ERPNext-linked fields; persisted draft, no stock posting | REFACTOR | Preserve useful workflow concepts; no entire-module import |
| CQ-006 | frappe_app/facility_os/facility_os/api/move.py::move_container | Concurrency risk | Read/save/audit with no explicit competing-write contract | REPLACE | Standalone database command to own stock movement |
| CQ-007 | frappe_app/facility_os/facility_os/api/count.py::record_count | Quantity and authority | float conversion; mutable draft count line; ERPNext master lookup | REFACTOR | Exact-decimal R1 quantity rules; legacy untouched |
| CQ-008 | frappe_app/facility_os/facility_os/api/security.py::require_any_role | Scope risk | Broad role checks without proven entity/warehouse authorization | REPLACE | Per-action server-side scope + object policy required |
| CQ-009 | frappe_app/facility_os/facility_os/api/users.py::list_users,set_roles | Domain confusion | Frappe User is not HFT Employee Master | DEFER | Never reuse as Employee Master |
| CQ-010 | frappe_app/facility_os/facility_os/facility_os/doctype/facility_stock_balance/facility_stock_balance.json | Duplicate authority | Synced ERPNext read model, not standalone stock account | DEFER | Preserve Phase 2 provenance; avoid live duplication |
| CQ-011 | frappe_app/facility_os/facility_os/facility_os/doctype/facility_stock_movement_fact/facility_stock_movement_fact.json | Duplicate authority | ERPNext-derived source_name movement fact | DEFER | Retain read-model design separately from ledger |
| CQ-012 | frappe_app/facility_os/facility_os/api/shopfloor.py::complete_operation,add_genealogy_event | Outside R1 scope | Candidate shopfloor path depends on future production genealogy acceptance | DEFER | Protected from unapproved clean-up |
| CQ-013 | lib/mis/sample-provider.ts; lib/facility/sample-provider.ts; lib/reconciliation/sample-provider.ts | Synthetic data paths | Legacy sample modes; actual reachability not yet verified | DEFER | Do not import into R1 backend |
| CQ-014 | package.json + absent lockfile (legacy) | Dependency hygiene | Semver ranges and no lockfile in Git tree | REPLACE | R1 lockfile/security audit still pending |
| CQ-015 | .github/workflows/ci.yml | Quality debt | Build, compileall, JSON syntax only; no automated workflow tests | REPLACE | Add separate test gate before merging |
| CQ-016 | .env.example | Hardcoded default | Preview and ERPNext connection placeholders; avoid live fallback | REPLACE | R1 production fail-closed gate; no secrets committed |
| CQ-017 | app/api/inventory/transaction/preview/route.ts | Unreachable-to-post | No live issue/return endpoint | KEEP | Preview validation intentionally separate; not stock authority |
| CQ-018 | app/documents/grn/page.tsx | UI candidate | GRN page may be reusable; direct dependencies not yet traced | DEFER | Needs UI review and tests before copying |

## Ownership and deferred inventory
16 owns R1 source quality, dependency analysis and code changes. 10 reviews authorization/security; 11 reviews audit and Holds; 13 reviews recovery/CI; 04 confirms workflows. All deferred items stay unchanged on legacy. Do not delete persisted records, migrations or future ERPNext contracts.

## Evidence status
- Git branch SHAs verified before branch creation.
- Full tree listed; subset of high-risk files inspected, not a complete repository-wide call graph.
- Dependency vulnerability scan, JavaScript lockfile, lint and production build not yet performed.
- Review/test evidence must reference exact new commit SHA.
- Release status NO-GO.

## 23 October 2026 — Incremental evidence-based scan and cleanup

Repository-wide Git tree inventory: 217 blobs, including 175 TS/TSX/Python source files at legacy donor cf5d45d1c5c1823e4a2d34dd3465bad9f37d9271. Source-content inspection covered selected application/domain files, 24 high-risk library/Python implementation files, both legacy workflows, package configuration and known DocType schemas. This is NOT yet a full reachability/call-graph analysis of every source file. No file was classified dead solely because it was old.

| ID | Exact source | Action | Reason, dependency and authorization |
|---|---|---|---|
| CQ-019 | .github/workflows/sync-frappe-deploy.yml::mirror (legacy) | DEFER | On legacy-branch push it force-pushes a deployment subtree; existing deployment linkage may rely on the branch. Never execute/delete without 13 and MASTER review. |
| CQ-020 | frappe_app/facility_os/facility_os/api/printing.py::approve_print_job and api/documents.py::transition (legacy) | DEFER | Operational approval patterns are useful; mutators use ignore_permissions and manual commits. No demonstrated per-entity object-scoped locking. Separate 10/11 review required. |
| CQ-021 | lib/documents/provider.ts::sampleDocument,previewPrintBatch and sampleBoxCard (legacy) | DEFER | Multiple synthetic representations and preview print flows coexist with Frappe operations. Actual consumers/persisted print jobs require graph tracing and regression before cleanup. |
| CQ-022 | lib/facility/provider.ts, lib/mis/provider.ts, lib/reconciliation/provider.ts, lib/sync/provider.ts (legacy) | DEFER | Provider switches allow samples/Frappe reads; preserve legacy/Phase 2 reference, never import fallback into R1 production. |
| CQ-023 | lib/hft/domain/masters.ts::validateItem,validateWarehouse,validateSupplier (engineering) | REFACTOR — COMPLETE | Separated master validity from active-transaction eligibility; inactive historical records can be retained but cannot transact. Local regression executed. |
| CQ-024 | lib/hft/domain/masters.ts::requireAvailableQuantityString (engineering draft) | REMOVE — COMPLETE | Unnecessary quantity helper duplicating dedicated quantity domain; removed before promotion. |
| CQ-025 | lib/hft/domain/ledger.ts::applyCommand (engineering) | KEEP — NONPRODUCTION | Pure deterministic test model, not an authoritative database adapter. No API may invoke it for real stock posting. |
| CQ-026 | middleware.ts (engineering) | KEEP — CANDIDATE | R1 production/active-HFT-API route gate deliberately returns 503. Runtime/build validation pending. |
| CQ-027 | db/migrations/0001_hft_masters.sql through 0003_hft_workflows.sql (engineering) | KEEP — CANDIDATE | PostgreSQL v15+ schema authored but not applied. Migration upgrade, integrity and concurrency tests remain mandatory. |
| CQ-028 | lib/hft/domain/grn.ts and opening-stock.ts (engineering) | KEEP — NONPOSTING | Shared validated business contracts; no actual GRN or opening-balance transaction can be posted. |
| CQ-029 | app/documents/grn/page.tsx and app/inventory/scan/camera-scanner.tsx (legacy) | REUSE CANDIDATE | Frontend components require independent assessment and exact-source tests before copying; no changes made. |
| CQ-030 | Legacy package.json and missing npm lockfile | REPLACE — PENDING | Dependency audit and version lock are not performed; do not label build reproducible. |

### Dependency and architectural findings
- Legacy package.json contains version ranges for Next.js/React/TypeScript; no dependency lockfile in the verified donor tree. Vulnerability status remains UNVERIFIED, not claimed safe.
- Three sample-provider families and additional mixed preview/persistent provider switches are present in the old library architecture. These are deliberately excluded from the new posting domain.
- The legacy Frappe role enforcement and API mutations remain ERPNext/Frappe-coupled. Standalone Phase 1 R1 paths must not depend on this authority.
- No production credentials, employee records, inventory transactions or live integrations were imported into the engineering branch.
- Full import/reachability proof, dependency scanning, migrations applied against PostgreSQL, real-browser E2E, production build and isolated independent AI reviews remain OPEN.

### Actual local checks (synthetic data only)
- Node.js v22.16.0 built-in TypeScript test runner: 12 of 12 committed smoke/workflow tests PASS after code changes.
- Strict domain TypeScript typecheck with global tsc v5.8.3: PASS.
- Local PostgreSQL server, Docker, package-lock-backed Next build, full lint suite, independent agent review: NOT AVAILABLE/NOT EXECUTED.
- No GitHub Actions were initiated; $1 Actions cap setting remains UNVERIFIED.

### Controlled cleanup policy
Legacy, main and deployment branches remain unchanged; no destructive cleanup, data deletion or migration rewriting has been authorized. Deferred cleanup owner: 16 engineering, reviewed as appropriate by 04/05/10/11/13 and approved by MASTER. Production disposition: NO-GO.
