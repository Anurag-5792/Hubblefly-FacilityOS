# Immutable Release and Recovery Manifest — <version>

**Maturity:** CANDIDATE / TESTED / RELEASED / DEPLOYED / PRODUCTION VERIFIED (record separate approvals)  
**Programme, owner and approval record:**  
**Release tag / exact source commit / built artifact digest:**  
**Issue/PR list / accepted exact HEAD and reviewed synthetic merge SHA:**  
**Date/time, build/CI run IDs, independent specialists and MASTER approval:**  

## 1. Reproducible build inputs
- Node.js/runtime, pnpm and frozen lockfile digest:
- Build pipeline identity and artifact checksum/signature:
- Source repository/ref and reproducibility evidence:
- Dependency SBOM/licence/security-advisory review and exceptions:
- Secrets/configuration keys, flags and secret-store authority (never values):

## 2. Joint compatibility matrix — must validate combined tuple
| Component | Current installed | Target/version contract | Test/compatibility evidence | Safe rollback? |
|---|---|---|---|---|
| FacilityOS application/UI/backend | | | | |
| PostgreSQL schema/migrations/types/RLS | | | | |
| ERPNext APIs/document semantics/official ledger | | | | |
| Runtime configuration/flags/secrets | | | | |
| Background workers/events/message schema | | | | |
| Legacy Frappe coexistence/cutover | | | | |
| Inventory physical/QC/reservation/reconciliation | | | | |

## 3. Deployment authorisation and verification
- Approved release and explicit environment deployment authority:
- Non-production test, smoke, ERPNext sandbox and migration validation:
- Current backups, PITR, retention, immutable copies and actual restore test:
- RPO/RTO requirement and observed recovery evidence:
- Deployment/health telemetry, alerting, log access, support/rollback owners:
- Inventory physical vs ERP ledger reconciliation before/after:
- Production verification decision and proof (do not infer from deployment success):

## 4. Failure, compensation, rollback
- Trigger conditions and STOP authority:
- Application binary rollback vs schema forward-fix/restore compatibility:
- ERPNext correction through authorised API reversal documents (never direct ERP DB writes):
- Inventory IQC/hold/rejected/returns evidence protection:
- Database PITR, migration/grant/RLS recovery and verification:
- Worker queues/replay/idempotency and data-integrity checks:
- Required MASTER/release/ERP/security approvals, audit artifacts:
- Known risks, constraints, open blockers, separate closure record:

**No release/deployment is authorised by completing this manifest.**
