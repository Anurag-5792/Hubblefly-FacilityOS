# FacilityOS Architecture v0.1

## Principle

FacilityOS is the operational web layer. ERPNext remains the ERP stock/accounting backbone.

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

### ERPNext
- Item
- Warehouse
- Serial No
- Batch
- Stock Ledger
- Purchase Receipt
- Stock Entry
- Delivery Note
- accounting-linked inventory

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

## Write discipline

ERP-linked stock writes must pass through a transaction service. UI components must never post directly to ERPNext.

Proposed path:

`UI -> FacilityOS command -> validation -> audit event -> ERPNext adapter -> ERPNext document -> sync result`

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
