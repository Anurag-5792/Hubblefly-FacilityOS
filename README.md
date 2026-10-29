# Hubblefly FacilityOS

FacilityOS is the HFT manufacturing operations platform for Stores, item and employee masters, physical stock, receiving, issue/return, quality, warehouse locations, manufacturing genealogy and dispatch.

## Controlling Phase 1 system-of-record boundary

**HFT FacilityOS is the standalone operational inventory authority for Hubblefly Technologies Limited Phase 1.** ERPNext stock/accounting integration and financial reconciliation are deferred to Phase 2. DD operational systems and DD MRO are separate. No DD runtime connection or shared database is authorized.

The current engineering branch is `engineering/hft-r1-stores-foundation` (existing Draft PR #11). This repository contains a combination of historical UI, independently reviewed source foundations and **review-only** database designs; source existence is not proof of production qualification.

## Minimum Stores production scope and owner release authorization

The HFT owner issued production GO on 29 October 2026 for the **1 November 2026** minimum Stores release: every material IN/OUT recorded through FacilityOS and every counted item linked to its **actual warehouse, rack/area, level, position, stack slot, bin/container and product version/serial/batch**. This is not authorization to waive independent technical qualification. If mandatory tests or verified operator approvals are missing, production posting stays disabled and the blocker is escalated.

Key invariants:
- Stock available for issue requires valid invoice/GRN/QC and authorization.
- Employee/work-order issue preserves exact source location, purpose and custody; receipt acknowledgement is independently evidenced.
- Physical counts capture evidence, not automatic stock increases/decreases.
- Opening stock, adjustments and between-bin transfers are separately authorized immutable movements; original facts are never overwritten.
- Stored items must resolve to a valid active **leaf** location; hierarchy and QR identifiers are governed.
- All item/manufacturing versions need verified primary photographs; version-photo completeness is tracked separately from master-record revision.

## Physical hierarchy

`Legal Entity → Site → Warehouse → Rack/Area → Level/Shelf → Position → Stack Slot → Bin/Container → Item Version → Batch/Serial`

Only genuinely inapplicable physical levels may use approved floor/storage-type exceptions. Do not fabricate IDs to satisfy a UI.

## Code quality and release

One maintained source tree; strict TypeScript and PostgreSQL contracts; legal-entity/site/warehouse RBAC, genuine human approval, default-deny database privileges, atomic posted entries, idempotent and reconciled COMMITs, immutable evidence and auditable recovery.

No production release without actual qualified PostgreSQL tests, full dependency lock and clean build, role/security denials, real browser/QR workflow, backup/restore proof and independently reviewed owner-approved operational cutover. PR #11 remains draft until qualification.

## Documentation

Two distinct packages are mandatory:

- **Restricted internal engineering:** source provenance, copied/adapted code history, rights, architecture, security and executed test evidence. Confidential dossiers do not belong in this public repository.
- **Source-free handover:** accepted user/admin workflows, operating procedures, support and recovery. Handover drafts must not claim unqualified features as available.

Historical architecture and donor code should not be treated as authority to bypass the controlling Phase 1 decisions.
