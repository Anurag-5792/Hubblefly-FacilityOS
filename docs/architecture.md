# FacilityOS Architecture v0.3 — SUPERSEDED / LEGACY REFERENCE

> **Status: SUPERSEDED AS TARGET ARCHITECTURE.**
>
> This document records the earlier FacilityOS-on-Frappe production direction. It is retained
> unchanged below as migration/history reference and must not be used as authority for new target
> implementation decisions.
>
> The accepted target architecture is documented in [target-architecture.md](./target-architecture.md):
> Next.js + TypeScript + PostgreSQL/Supabase + controlled ERPNext API integration.
>
> Legacy Frappe code remains present until replacement is implemented, tested, cut over and
> explicitly approved for cleanup.

# FacilityOS Architecture v0.3

## Principle

FacilityOS is the operational web layer and analytics/read-model platform. ERPNext remains the authoritative ERP, stock-ledger and accounting backbone.

The systems must not become competing masters.

## Cost constraint

FacilityOS must add **no separate recurring infrastructure or software cost** beyond the Frappe/ERPNext hosting already being used.

Therefore the production baseline is:

- no separately billed managed PostgreSQL service
- no paid cache/search service
- no paid analytics platform
- no paid AI/API dependency
- no second paid application host

FacilityOS reporting and operational tables will live inside the existing Frappe site database through a version-controlled FacilityOS Frappe app / DocTypes. Frappe background jobs and scheduler will be used for synchronization and read-model maintenance.

The existing Next.js code remains the interaction/UI prototype while the backend contracts are kept compatible with the Frappe production implementation.

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
- FacilityOS-native DocTypes/tables
- MIS/reporting read model
- cached/synchronized ERPNext projections required by the app
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

FacilityOS uses the **existing Frappe site database**, not a second managed database.

The FacilityOS schema has two logical responsibilities:

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
   - Item projection
   - Warehouse projection
   - Serial No projection
   - Batch projection
   - stock-balance projection
   - stock-ledger/reporting projection
   - selected document/report facts needed for MIS

ERPNext-derived FacilityOS tables are read models, not a second transactional master.

## MIS architecture

MIS must normally query the FacilityOS read model instead of repeatedly executing ERPNext API calls or expensive ERP ledger queries.

Production path:

`ERPNext/Frappe document event -> FacilityOS background update -> FacilityOS reporting DocTypes/read-model tables -> MIS query service -> dashboard/table/chart`

Recovery path:

`scheduled reconciliation -> compare source modified timestamps/counts -> repair read model -> record sync audit`

This allows:
- fast dashboards
- historical snapshots
- cross-module reporting
- minimal API load
- responsive filters and drilldowns
- consistent metric definitions
- no extra database hosting bill

## Synchronization model

Because FacilityOS and ERPNext live on the same Frappe site, the preferred model is:

1. Frappe `doc_events` hooks for relevant ERPNext DocTypes.
2. `frappe.enqueue` background jobs for read-model updates when work should not block the transaction.
3. Incremental reconciliation using source `modified` timestamps.
4. Frappe scheduler jobs for periodic health/reconciliation.
5. A rebuild command for an individual projection when required.

Every synchronized record should carry:
- ERPNext DocType/source
- ERPNext document name
- source modified timestamp
- FacilityOS synced-at timestamp
- source hash/version where useful
- company/warehouse scope where applicable

Sync processing must be idempotent.

## Write discipline

ERP-linked stock writes must pass through a transaction service. UI components and MIS must never write directly to ERPNext ledger tables.

Proposed command path:

`UI -> FacilityOS command -> validation -> audit event -> supported Frappe/ERPNext document action -> read-model refresh`

FacilityOS MIS is read-only by default.

## Data consistency

For ERP-owned stock facts:
- ERPNext is authoritative.
- FacilityOS read models may be briefly behind while a background update is running.
- MIS displays a last-synced timestamp.
- critical stock actions validate against authoritative ERP state before submission when stale data could cause an incorrect write.

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

The current physical-count/reconciliation workbook is approved as development/sample input only.

Rules:
- sample data must never be treated as posted opening stock
- sample data must be explicitly marked as sample/preview
- real inventory workbooks must not be committed while this repository is public
- private sample/import files stay outside Git or in ignored private-data paths
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
