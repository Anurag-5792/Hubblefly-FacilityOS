# FacilityOS Read Model v0.1

## Objective

Provide fast MIS and operational reads without repeatedly calling ERPNext APIs, while keeping ERPNext authoritative for ERP stock/accounting transactions and adding no separate recurring infrastructure cost.

## Production storage

Use FacilityOS DocTypes/tables inside the existing Frappe site database.

Do not provision a separate managed database for the baseline.

## Proposed FacilityOS read-model DocTypes

### FacilityOS Item Snapshot

Purpose: reporting projection of ERPNext Item.

Minimum fields:
- source_name — ERPNext Item name / item_code
- item_code
- item_name
- item_group
- brand
- stock_uom
- has_serial_no
- has_batch_no
- disabled
- source_modified
- synced_at

Unique key:
- source_name

### FacilityOS Warehouse Snapshot

Purpose: reporting projection of ERPNext Warehouse.

Minimum fields:
- source_name
- warehouse_name
- company
- parent_warehouse
- is_group
- disabled
- source_modified
- synced_at

### FacilityOS Stock Balance

Purpose: fast stock-on-hand / warehouse / item reporting.

Minimum fields:
- company
- warehouse
- item_code
- actual_qty
- reserved_qty
- projected_qty
- valuation_rate
- stock_value
- source_modified
- synced_at

Unique logical key:
- company + warehouse + item_code

### FacilityOS Serial Snapshot

Purpose: serial status and location reporting.

Minimum fields:
- serial_no
- item_code
- warehouse
- batch_no
- status
- company
- source_modified
- synced_at

### FacilityOS Batch Snapshot

Purpose: batch status and balance reporting.

Minimum fields:
- batch_no
- item_code
- manufacturing_date
- expiry_date
- disabled
- source_modified
- synced_at

### FacilityOS Stock Movement Fact

Purpose: MIS movement history and aggregation.

Minimum fields:
- source_name — Stock Ledger Entry name
- posting_date
- posting_time
- company
- warehouse
- item_code
- actual_qty
- qty_after_transaction
- valuation_rate
- stock_value_difference
- voucher_type
- voucher_no
- batch_no
- serial_no
- source_modified
- synced_at

Indexes required:
- posting_date
- company + posting_date
- warehouse + posting_date
- item_code + posting_date
- voucher_type + posting_date

### FacilityOS Sync State

Purpose: synchronization health.

Minimum fields:
- projection
- last_source_modified
- last_success_at
- last_attempt_at
- status
- rows_processed
- error_summary

### FacilityOS MIS Saved View

Purpose: user-saved report definitions.

Minimum fields:
- owner
- view_name
- module
- filters_json
- metric
- group_by
- columns_json
- is_shared

## FacilityOS-native operational DocTypes

These are not ERPNext projections and FacilityOS is authoritative for them:

- Facility Position
- Facility Stack Slot
- Facility Container
- Facility Container Content
- Facility Physical Count Session
- Facility Physical Count Line
- Facility Genealogy Event
- Facility QR Index
- Facility Operational Audit

## Sync triggers

Initial source DocTypes:

- Item
- Warehouse
- Serial No
- Batch
- Stock Ledger Entry
- Purchase Receipt
- Stock Entry
- Delivery Note

Use Frappe doc hooks only when they are reliable for the source operation. High-volume or ledger-derived projection updates should be backgrounded with `frappe.enqueue`.

## Reconciliation

A scheduler job must periodically:

1. read ERP source records modified after the last watermark
2. upsert FacilityOS projections idempotently
3. record the new watermark only after successful processing
4. update FacilityOS Sync State
5. expose last-success and lag information to MIS

A projection rebuild command must be available for recovery.

## MIS query contract

The current prototype endpoint is:

`GET /api/mis/query`

Production Frappe backend should expose an equivalent read-only method accepting:

- period/date range
- company
- warehouse
- module
- metric
- groupBy
- optional item/item-group filters

Response should include:

- rows
- total
- source = FacilityOS read model
- lastSyncedAt
- query metadata

## Freshness rule

MIS may use synchronized data.

Any command that can change ERP stock/accounting state must validate authoritative ERP state at transaction time where stale data could produce an invalid action.

## Sample-data rule

The approved physical-count workbook is development sample input, but the repository is currently public.

Therefore:
- real workbook contents stay outside Git
- public source code uses synthetic sample data
- private/local seed tooling may import the real workbook later
- sample data never becomes opening stock without approval
