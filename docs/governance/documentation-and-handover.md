# Documentation, ADR Lifecycle and Independent-Team Handover Standard

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-06  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## 7. Documentation, ADRs, independent-team handover

### 7.1 Documentation-as-code

Every module handover must recover: **product vision; business and operational problem; capability/feature inventory; business value; users/actors and lifecycle; in/out scope; dependencies and upstream/downstream processes; authority and data ownership; state/invariant contracts; security and approvals; APIs/events/integration; failure and recovery; build/test/deploy/operate/troubleshoot procedures; acceptance evidence; current maturity/status; limitations, open decisions and superseded decision history**. The module guide is not solely a technical API reference.

Canonical governance index must link rather than silently relocate existing `docs/target-architecture.md`, `docs/database-access.md`, `docs/adr/0001-capability-based-scoped-authorization.md`, `docs/adr/0002-rls-runtime-context.md`, `docs/security/authorization.md`, `docs/security/rls.md`, `docs/handover/w0-07-authorization.md`, `docs/handover/w0-08-rls.md`, and inventory/read-model/UAT documents. Architectural/doc structural reconciliation belongs R4.

### 7.2 ADR lifecycle

A durable architecture/system-of-record/security/schema/API/deployment decision receives an ADR with status `PROPOSED / ACCEPTED / REJECTED / SUPERSEDED`, decision authority, context, options and trade-offs, implications, affected modules and supersession links. Do not silently rewrite an accepted ADR; supersede by traceable new acceptance.

### 7.3 Handover acceptance

A separate engineering team must be able to identify correct source/commit, reproduce local environment and tests, understand product purpose/workflows and inventory/ERP authority, explain contracts/security, perform safe migrations in non-production, implement/trace/review an issue, operate/deploy a release, diagnose failures, perform documented rollback/recovery and resume development **without dependence on historic ChatGPT conversations**. Document unknowns; do not assert deployment or production verification without evidence.

## Canonical handover artifact minimum

Every module guide must state **product vision**, customer/operational problem, business value, features/capabilities, users and responsibilities, in/out scope, operational lifecycle (normal and exception), authority/stock facts, role/capability/RLS, APIs/jobs/events/integration/ERPNext, database schema/migration, evidence retention, build/test/UAT, release/environment/config, health/logging, troubleshooting, failure/recovery, rollback, known risks and limitations, maturity/status and traceable accepted/proposed/superseded decisions. Use the accompanying [module handover template](../templates/module-handover.md).

### Existing accepted material to link, not move

- `docs/target-architecture.md`, `docs/database-access.md`.
- `docs/adr/0001-capability-based-scoped-authorization.md`, `docs/adr/0002-rls-runtime-context.md`.
- `docs/security/authorization.md`, `docs/security/rls.md`.
- `docs/handover/w0-07-authorization.md`, `docs/handover/w0-08-rls.md`.
- `docs/inventory-mvp-uat.md` and `docs/facilityos-read-model.md` as historical/reference where superseded.

Documentation changes and ADR supersession require appropriate approval; R4 owns structural reconciliation, including migration of current modules toward selected target `src/modules/`. No R1 document claims implementation or production verification without exact live evidence.
