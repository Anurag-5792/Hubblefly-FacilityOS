# Release, Deployment, Compatibility, Rollback and Recovery Policy

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-07  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## 8. Release/deployment/rollback and compatibility governance

R1 defines policies only. Future immutable release manifests identify semantic version, Git SHA, built artifact identity, Node/pnpm/lockfile, schema/migrations, configuration/flags, supported ERPNext API/document contract, job/message compatibility, issues/PRs, known limitations, operator and approval evidence. Deployment must verify the **combination** application↔database schema↔ERPNext API↔configuration↔worker/message schema↔legacy coexistence. A green app build is insufficient.

Release path: accepted head → immutable release → non-production deployment/smoke/migration verification → explicit production approval → production deployment → health/data reconciliation → separately recorded PRODUCTION VERIFIED. Do not deploy dirty or unreviewed code. Database expand/contract/forward-recovery preferred; destructive DOWN migration cannot be assumed safe. ERP reversal via authorised ERP transaction, never direct SQL. Inventory/quality/audit history corrections should preserve compensating history. Establish production backup retention, PITR, RPO/RTO, independent restore test, backup/access ownership and evidence before production-readiness declaration. Live hosted configuration is not yet verified.

## Mandatory release/rollback decision protocol

1. Release identity: version/tag, exact accepted Git SHA, reproducible built artifacts/digests, Node 24/pnpm 11.27.1/lockfile, database migration/schema version, configuration/flags, ERPNext API contract, worker/message compatibility, legacy coexistence, issues/PRs, limitations, approvals.
2. Build `passed` is not `released`, `deployed` or `production verified`; these are separate states with separate evidence.
3. Verify the **joint compatibility set** application ↔ DB/schema/migrations ↔ ERPNext API and official stock document semantics ↔ configuration/secrets ↔ workers/events ↔ legacy owner/cutover. Reject if any component is incompatible/unknown.
4. Promote through authorised non-production smoke/UAT and migration/recovery tests, separately authorised production gate, backup/PITR/RPO/RTO and restore proof, deployment observation, official ERP reconciliation and explicit production verification.
5. On a failed/partial change, STOP mutation and use recorded runbooks. Reverting only application code may be unsafe after schema migration; prefer forward-compatible expand/contract and authorised forward repair. ERPNext stock/finance reversal must use official API documents/compensations, never direct SQL. Retain immutable Inventory, quality, security and audit evidence.
6. Rollback approval must identify point-in-time backups, proven data restore, schema compatibility, affected workers/queues and official ERP transaction/posted status; observe recovery results rather than assuming success.

This R1-07 implementation is **policy/documentation only**, no GitHub Releases, deployment, backup changes or live production verification.

Use the [release manifest template](../templates/release-manifest.md).
