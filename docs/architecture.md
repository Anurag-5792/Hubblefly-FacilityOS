# FacilityOS Architecture v0.2

## Principle

FacilityOS is the operational web layer and analytics/read-model platform. ERPNext remains the authoritative ERP, stock-ledger and accounting backbone.

The systems must not become competing masters.

## Responsibility split

### FacilityOS
- responsive desktop/mobile UX
- QR resolver
- rack/level/position/stack-slot model
- container model (BN/BX/BB)
- inventory scan workflows
- SFG/component genealogy
- route-card UX
- Gate Pass and Delivery Challan presentation
- operational audit events
- FacilityOS-native operational database
- MIS/reporting read model
- cached/synchronized ERPNext master and ledger projections required by the app
- saved MIS views, exports and dashboard preferences

### ERPNext
- Item
- Warehouse
- Serial No
- Batch
- Stock Ledger
- Purchase Receipt
- Stock Entry
- Delivery Note
- valuation and accounting-linked inventory
- authoritative ERP transaction state

## FacilityOS database

FacilityOS will use its own PostgreSQL database.

The database has two logical responsibilities:

1. **FacilityOS-native operational data**
   - physical Position
   - Stack Slot
   - Container
   - genealogy events
   - physical-count sessions
   - QR index
   - operational audit
   - saved reports/views

2. **ERPNext reporting/read model**
   - synchronized Item projection
   - Warehouse projection
   - Serial No projection
   - Batch projection
   - stock-balance projection
   - stock-ledger/reporting projection
   - selected document/report facts needed for MIS

ERPNext-derived tables are read models, not a second transactional master.

## MIS architecture

MIS must normally query the FacilityOS database instead of repeatedly calling ERPNext APIs.

Proposed path:

`ERPNext -> sync worker -> FacilityOS reporting tables/materialized views -> MIS API -> dashboard/table/chart`

FacilityOS-native operational events are written directly to FacilityOS and can be joined with the synchronized ERP projections.

This allows:
- fast dashboards
- historical snapshots
- cross-module reporting
- lower ERPNext API load
- responsive filters and drilldowns
- consistent metric definitions

## Synchronization model

Preferred order:

1. ERPNext webhook/event notification where reliable and available.
2. Incremental sync by `modified` timestamp as the standard recovery/catch-up path.
3. Scheduled reconciliation jobs to detect missed updates.
4. Full rebuild tooling for an individual projection when required.

Every synchronized record should carry:
- ERPNext doctype/source
- ERPNext document name
- source modified timestamp
- FacilityOS synced-at timestamp
- source hash/version where useful
- company/warehouse scope where applicable

Sync processing must be idempotent.

## Write discipline

ERP-linked stock writes must pass through a transaction service. UI components and MIS must never post directly to ERPNext.

Proposed command path:

`UI -> FacilityOS command -> validation -> FacilityOS audit event -> ERPNext adapter -> ERPNext document -> sync result -> FacilityOS read model refresh`

FacilityOS MIS is read-only by default.

## Data consistency

For ERP-owned stock facts:
- ERPNext is authoritative.
- FacilityOS may be briefly behind during synchronization.
- MIS should display a last-synced timestamp.
- critical stock actions must validate against ERPNext at transaction time when stale data could cause an incorrect write.

For FacilityOS-native facts:
- FacilityOS is authoritative.

## Location hierarchy

`Warehouse -> Rack -> Level -> Position -> Stack Slot -> Container -> Item`

Position QR example: `R03-L2-P04`

Resolved live slot example: `R03-L2-P04-S2`

## QR resolver types

The resolver must distinguish at least:

- item serial
- batch
- position
- BN bin
- BX carton
- BB battery carton
- SFG serial
- final drone serial

Resolution must be deterministic from the stored identifier, not from free-text descriptions.

## Sample data

Physical-count/reconciliation workbooks can be used as development sample data.

Rules:
- sample data must never be treated as posted opening stock
- sample data must be explicitly marked as sample/preview
- real inventory workbooks must not be committed to a public repository
- opening-stock posting remains approval-gated

## Irreversible-output gate

The following require preview/validation before posting or printing at scale:

- opening stock
- mass serial creation
- bulk QR/sticker output
- stock reconciliation adjustments
- destructive genealogy correction

## Responsive UX

Desktop emphasizes tables, bulk review, reconciliation and administration.

Mobile emphasizes scanning, one task per screen and large confirmation controls.
