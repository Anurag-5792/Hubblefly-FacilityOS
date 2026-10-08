# Governance Index — R1-01 through R1-08

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-01  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## Source of authority and template precedence

00 — MASTER is final programme PR acceptance authority. The binding governance source is **R1 SDLC Governance Design v1.2 (approved 8 October 2026)** and the approved **R1 Governance Implementation Plan v1.2**; prior Design v1.1 is historical technical provenance, not current PR-review policy. The exact Issue, Implementation Plan and PR templates from Design v1.2 **Appendices A–C** are published at the paths below. No universal GitHub-native human approval is imposed; it is required only if actual verified GitHub rules require one. An AI specialist report is technical programme evidence, not a GitHub APPROVE event.

Original trusted S0: `864fc2c4087b43009433db2c98d3caf3239bb2fc`. Post-bootstrap S_BOOT: `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`. Integration branch: `rebaseline/sdlc-v1`. W0-01 to W0-08 remain **TESTED**, not DEPLOYED/PRODUCTION VERIFIED; W0-09 salvage only; W0-10 onward unauthorised. CI-BOOT-01 was independently accepted before this implementation.

## Implementation documents: R1-01 through R1-08

| Package | Implemented governance artifact |
|---|---|
| R1-01 | [Authority and phase boundaries](authority-and-phase-boundaries.md) |
| R1-02 | [Engineering standards](engineering-standards.md) and [contributor instructions](../../CONTRIBUTING.md) |
| R1-03 | [DoR/DoD](readiness-and-done.md) and [exceptions/transition register](exception-and-transition-register.md) |
| R1-04 | [Issue template](../../.github/ISSUE_TEMPLATE/implementation.md), [implementation-plan template](../templates/implementation-plan.md), [PR template](../../.github/PULL_REQUEST_TEMPLATE.md) — literal Design v1.2 Appendices A–C |
| R1-05 | [Review and exact-HEAD evidence](review-and-evidence.md), [review evidence template](../templates/review-evidence.md) |
| R1-06 | [Documentation and handover](documentation-and-handover.md), [module handover template](../templates/module-handover.md) |
| R1-07 | [Release, deployment, rollback and recovery](release-deployment-recovery.md), [release manifest template](../templates/release-manifest.md) |
| R1-08 | [Ownership/RACI Option B](ownership-and-approvals.md), [reviewer/platform prerequisites](reviewer-prerequisites.md) |

R1-09 independent review and R1-10 MASTER handover/closure are **not** part of this implementation. Specifically **do not create** `docs/handover/r1-governance.md` yet.

## Existing canonical architecture and tested security anchors

- [Target architecture](../target-architecture.md) — ERPNext vs FacilityOS fact ownership; modular monolith and legacy coexistence.
- [Database access/UnitOfWork](../database-access.md) — inward contracts and transactional boundaries.
- [ADR-0001 Capability-based authorization](../adr/0001-capability-based-scoped-authorization.md) and [Authorization model](../security/authorization.md).
- [ADR-0002 Runtime RLS context](../adr/0002-rls-runtime-context.md) and [RLS security](../security/rls.md).
- [W0-07 authorization handover](../handover/w0-07-authorization.md) and [W0-08 RLS handover](../handover/w0-08-rls.md).
- [Inventory UAT/reference](../inventory-mvp-uat.md) and [FacilityOS read-model](../facilityos-read-model.md), historical where superseded.

These files remain unchanged by R1. Older Frappe-first architecture descriptions are **SUPERSEDED / LEGACY REFERENCE** and not current deployment authority.

## Required business and security boundaries

Inventory Management is **mandatory core**: inward/GRN/IQC Accepted–Rejected–Hold–Return, physical location/container/serial/batch, reservation/kitting/issue/consumption, count/reconciliation/adjustment, traceability and MIS, with physical, quality, availability and ERP posting states separate. ERPNext is authoritative for official stock ledger, financial accounting and valuation; FacilityOS holds operational and physical execution truth. Direct ERPNext database writes are prohibited. W0-03 UnitOfWork, W0-07 default-deny authorization and W0-08 PostgreSQL RLS are preserved. The legacy Frappe app and 23 DocTypes must not be removed before approved replacement/migration/cutover.

## Workflow and non-authorisation

Requirement → accepted design → MASTER implementation authorisation → DoR → issue/plan/branch → tests/current-HEAD CI → independent specialist AI technical review of actual source → conditional native GitHub approval if verified enforced → MASTER **final** PR acceptance → repository-owner compliant merge. Every new PR HEAD commit invalidates previous technical verdicts, applicable CI and MASTER acceptance.

R1 specifies governance artifacts; R2 owns branch protection/rulesets/CODEOWNERS/merge enforcement; R3 approved cleanup; R4 structural `src/modules/` reconciliation; R5 CI/test consolidation; R6 W0-09 salvage. R1 may not exercise any of those powers.
