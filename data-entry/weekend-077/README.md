# R77 weekend Stores master-data intake — 14–15 November 2026

**Offline staging only. Production NO-GO; Gate R HOLD; Gate A HOLD.**

The HFT middleware denies all `/api/hft/*` calls with HTTP 503. The R77 gateway is qualification-only and STOP-guarded. None of the CSVs or staged JSON in this folder posts inventory or becomes an authoritative database record.

## Owner instructions

1. Keep these CSV files **privately**, outside GitHub, after entering actual employee names, suppliers, physical locations and invoice material.
2. Save in UTF-8 CSV with the exact original header names and columns. Blank source templates are intentionally free of fabricated records.
3. Enter known legal entity and site references first. Then fill warehouses, employees, items, suppliers, locations and item versions. These references are only operator-supplied context, not verified database existence.
4. Record actual physical hierarchy (RACK → LEVEL → POSITION → STACK_SLOT/BIN, or STACK_SLOT → BIN/CONTAINER), with real inspection reference. Entered `physicallyVerified=YES` is not certified P0 authority.
5. For a version photo, supply actual photo bytes in `photos/`, its real SHA-256, and rights reference; no primary image or approved version may be invented.
6. Opening-stock observations are field observations, **not** accounts, balances or opening transactions. Invoice/GRN preparation entries are source notes, **not** approved GRNs, QC decisions or RECEIVE transactions.

The corresponding offline intake utility, `tools/hft_weekend_master_intake.mjs`, must not access PostgreSQL, HTTP APIs, sessions, signing keys or protected SQL.

```bash
node tools/hft_weekend_master_intake.mjs --input ./data-entry/weekend-077/templates --output ./private-weekend-staged
```

Use a separate private writable copy of the templates as input; choose an output path that does not exist. Validation errors yield `validation-report.json` only. A successful run produces normalized CSV, a source-SHA256 manifest and `p3-create-candidates.UNSUBMITTED.json`. The staging output contains company data and must never be committed as source.

## Exact P3 mapping and limits

| CSV | Contract kind | Record ID | Exact `values` | State |
| --- | --- | --- | --- | --- |
| employees | EMPLOYEE | employeeId | fullName, department, designation, siteId | P3 Employee APPLY exists only as protected source; independent signed approval and installation required |
| items | ITEM | itemCode | uom, controlType | Draft request source only; no qualified Item APPLY |
| suppliers | SUPPLIER | supplierId | legalName | Draft request source only; no qualified Supplier APPLY |
| warehouses | WAREHOUSE | warehouseId | name, siteId | Draft request source only; current P3 submit requires an existing active warehouse, so new warehouse bootstrap is unresolved |
| locations | LOCATION | locationId | parentLocationId | Draft request source only; location kind/physical certification NOT mapped into P3 |

P3 CREATE proposals use `HFT-R1-P3-MASTER-V1`, `expectedVersion:"0"`, `operation:"CREATE"`, verified entity/site/warehouse scope and a genuine explanation. The local stage must not allocate a valid authentication proof or request authorization; `requestId` is intentionally null. A future **authorized** integration must generate its own request ID, verify the actual actor/session, read current PostgreSQL identity/revisions, perform duplicate/conflict checks against the database, and route through the existing protected P3 boundary without bypassing middleware.

`item_versions.csv` is **separate**, requiring the governed HFT item-version and photo/rights approval. `opening_stock_observations.csv` and `invoice_grn_preparation.csv` must never be converted into stock commands or signed approvals by the offline utility.

## Monday handover blockers

- Chat 13: independently admitted disposable PostgreSQL 18.6 resource, installation and database identity.
- Chat 10 V2: signer, app-runtime roles, protected P3/R77 gateway ownership and ACL acceptance.
- Chat 11 V2: real human maker/checker, invoice, GRN, QC and original-source evidence governance.
- Chat 17: independent positive/negative R77 RECEIVE PostgreSQL acceptance and verified readback.
- Engineering: qualified master apply paths for Item/Supplier/Warehouse/Location, governed entity/site bootstrap, P0 physical-location-kind certification, and a mutually accepted activation plan.

**A Monday data-entry demonstration can show offline CSV validation and staging; it cannot claim working operational Stores or database-persisted master records.**
