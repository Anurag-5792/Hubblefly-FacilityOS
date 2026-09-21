# FacilityOS Frappe App

Deployable Frappe/ERPNext backend for Hubblefly FacilityOS.

## Responsibilities

- FacilityOS-native operational DocTypes
- Position/container/location truth
- physical-count sessions and reconciliation
- Inventory-person and Admin validation audit trail
- label registry and traceability exceptions
- ERPNext-derived read models for MIS
- controlled FacilityOS count/move APIs
- server-side FacilityOS role enforcement

ERPNext remains authoritative for stock/accounting transactions.

## Safety

- Opening-stock posting is not implemented.
- ERPNext stock write endpoints are not enabled.
- Admin validation only makes a reconciled session eligible for a later, separately approved posting step.
- Prepared/unused serial labels are not physical inventory.

## Deployment

This app is mirrored to the repository branch `frappe-app-deploy`, where `pyproject.toml` and the `facility_os` package are at repository root for Frappe Cloud / Bench installation.
