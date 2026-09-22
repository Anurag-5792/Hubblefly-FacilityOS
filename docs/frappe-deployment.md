# FacilityOS Frappe Deployment

## Purpose

The Next.js FacilityOS UI remains separate from ERPNext. The server-side FacilityOS Frappe app is in:

`frappe_app/facility_os`

It installs operational DocTypes, reconciliation/validation APIs, read-model DocTypes and incremental ERPNext-to-FacilityOS synchronization.

ERPNext remains the authoritative stock/accounting system.

## Local / self-hosted Bench install

From the Frappe bench:

```bash
bench get-app /path/to/Hubblefly-FacilityOS/frappe_app/facility_os
bench --site <site-name> install-app facility_os
bench --site <site-name> migrate
```

Then run the initial read-model synchronization:

```bash
bench --site <site-name> execute facility_os.sync.run_incremental_sync
```

Do not run opening-stock posting. FacilityOS currently has no opening-stock posting implementation.

## Frappe Cloud

The FacilityOS Frappe app must be installed as a custom app on the same site as ERPNext.

A standalone deployment branch is maintained in the same GitHub repository:

`frappe-app-deploy`

That branch exposes `pyproject.toml` and the `facility_os` package at repository root for Frappe Cloud / Bench installation. The development source remains under `frappe_app/facility_os` on the main feature branch. Do not place inventory data, credentials or private reconciliation files in the deployment branch.

## Required roles

Installation provisions these roles:

- FacilityOS Inventory
- FacilityOS Shopfloor
- FacilityOS MIS
- FacilityOS Admin

Recommended assignments:

- store/count users → FacilityOS Inventory
- shopfloor users → FacilityOS Shopfloor
- management read-only users → FacilityOS MIS
- controlled administrators/approvers → FacilityOS Admin

For inventory reconciliation, the Admin approver must be a different user from the Inventory validator.

## Next.js environment

Production FacilityOS UI requires server-only values:

```env
ERPNEXT_BASE_URL=https://<site>.frappe.cloud
ERPNEXT_API_KEY=<server-service-api-key>
ERPNEXT_API_SECRET=<server-service-api-secret>

FACILITYOS_AUTH_SOURCE=frappe
FACILITYOS_MIS_SOURCE=frappe
FACILITYOS_OPERATIONS_SOURCE=frappe

FACILITYOS_DEFAULT_COMPANY=Hubblefly Technologies Limited
FACILITYOS_DEFAULT_WAREHOUSE=HFT Store
```

The server API key is used for server health/read integration. User approval actions use the signed-in Frappe session, not the service-account role.

Never expose API credentials to browser code.

## Installation verification

Open:

`/admin/integrations`

Expected after installation and migration:

- ERPNext: Connected
- FacilityOS Backend: Ready
- Missing DocTypes: None reported
- Operations source: frappe
- MIS source: frappe
- ERP writes: Disabled
- Opening stock: Blocked

Then open:

`/admin/sync`

Run **Run Sync Now** as a FacilityOS Admin. This only refreshes FacilityOS reporting projections.

## Validation flow

1. Inventory user records physical counts.
2. Inventory user submits count session.
3. Inventory user validates the reconciled inventory.
4. A different Admin reviews and approves.
5. Session becomes **Ready for Approval** only when no blocking exceptions remain.
6. Opening-stock posting is still a separate future control and is not implemented.

## Current production gates

Do not enable stock posting until all are complete:

- real Frappe app installation verified
- Item/Serial/Batch responses validated against the live site
- physical count data reconciled
- serial/batch exceptions resolved
- container/position mapping verified
- Inventory validation UAT passed
- Admin validation UAT passed
- ERPNext transaction mapping approved
- opening-stock posting preview reviewed and explicitly approved
