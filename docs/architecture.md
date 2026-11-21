# HFT FacilityOS — Phase 1 Controlling Architecture

**Decision basis:** HFT MASTER V2 Phase 1 standalone inventory authority and 1 November 2026 owner Stores GO. **Current technical release:** NO-GO pending qualification.

## Systems of record and legal boundaries

FacilityOS is HFT's sole operational stock quantity, stock-location, custody and immutable movement authority for Phase 1 **after technical release acceptance**. ERPNext integration/accounting belongs to Phase 2, not a prerequisite for Stores operation. DD software and data remain separate. Approved selected DD *code* may be copied and adapted inside HFT under internal reuse documentation; do not connect HFT directly to DD systems.

## Mandatory stock mutation path

`HFT User / Scanner → signed scoped UI/API → verified actor, approval/Hold and document revision → one protected PostgreSQL posting writer → atomic stock accounts/entries, custody, immutable outcome and audit → durable verified readback`

No UI, bulk import, stock count or reused legacy service may modify stock accounts by direct table DML. A genuine independently eligible human is mandatory where the business policy calls for independent approval. Alternate login names for one person do not satisfy that requirement.

The existing canonical migrations 0001–0006 preserve historical/immutable controls. The more advanced P2 protected writer and P3 master application remain nonexecutable candidates until reviewed and qualified under an authorized forward migration. Never alter applied migration history.

## Physical warehouse model

`Legal Entity → Site → Warehouse → Rack/approved Area → Level/Shelf → Position → Stack Slot → Bin/Container → Item + Product Version + Batch/Serial`

The persisted location model must use stable, scoped IDs and validated typed parentage. Every posted item quantity and physical counted line must point to an **actual active leaf**. The path is derived from authoritative parent relationships, not accepted as an unchecked free-text string. Bin BN, carton BX, battery carton BB and approved floor/storage exceptions must be represented consistently. Preserve older/inactive path history for posted movement reconstruction.

Location transfers are authoritative balanced, authorized stock transactions with original and destination leaf identities and audit—not updates to a display field.

## Distinct operational facts

- **Physical inward:** evidence of arrival; not QC acceptance.
- **GRN/QC-approved receipt:** authorized external-to-available movement into a specific location.
- **Issue:** available-to-employee/work-order custody or explicitly authorized consumption.
- **Return:** inspected custody-to-available/damaged/quarantine movement.
- **Physical count:** timestamped evidence per item/version/serial/batch and exact leaf location; does not post stock.
- **Opening stock/correction:** independent verified reconciliation plus authorized immutable boundary posting.
- **Location transfer:** controlled, conservation-preserving movement across location accounts.

Each business event has separately verified source, actor, document revision, approval, Hold policy, identity, quantity, idempotency key, posting outcome, audit evidence and durable readback.

## Product versions, images, scans and reporting

The physical product/manufacturing version is different from the Item Master record revision. Each item version—including historical versions—requires a separately verified primary photograph and accurate media provenance. Existing DD filenames alone never establish matching HFT item/version identity.

QR identifiers must resolve deterministically to the authorized object and location. Never infer physical inventory solely from an existing label or QR code. Reports show quantities reconstructed from accepted HFT postings at a consistent watermark; no hardcoded or unqualified inventory metrics.

## Evidence, operations and documentation

Secure authentication, entity/site/warehouse RBAC, independent human approvals, protected schema grants and audit/Hold enforcement are non-negotiable. Automatic blind retry after uncertain COMMIT is prohibited. Restore acceptance must reconcile serial location and custody as well as aggregate stock.

Maintain source-level security/architecture/reuse records in **restricted internal documentation**; keep source-free handover operating instructions in a separate approved package. Confidential source and reuse dossiers are not published inside this public repository.

**Status:** Source and draft design do not imply functional acceptance. Owner production GO is recorded for 1 November 2026; technical database, workstation, full build/browser and independently executed release gates remain open.
