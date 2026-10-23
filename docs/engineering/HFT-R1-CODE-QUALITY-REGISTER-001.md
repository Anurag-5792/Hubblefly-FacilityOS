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
