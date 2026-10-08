# FacilityOS Frappe App

This directory contains the server-side FacilityOS app intended to be installed on the same Frappe/ERPNext site used by Hubblefly.

It is deliberately separate from the Next.js operator UI at the repository root.

## Responsibilities

- FacilityOS-native operational DocTypes
- Position/container/location truth
- Physical-count sessions and reconciliation
- Inventory-person and Admin validation audit trail
- ERPNext-derived read models for MIS
- Whitelisted read-only APIs consumed by the FacilityOS web app

ERPNext remains authoritative for stock/accounting transactions.

## Production security

The Frappe APIs use the authenticated Frappe user and server-side roles. Client-provided role names are never trusted for production approval.

Required roles:
- FacilityOS Inventory
- FacilityOS Shopfloor
- FacilityOS MIS
- FacilityOS Admin

Opening-stock posting is not implemented in this app scaffold. Admin validation only makes a reconciled session eligible for a later, separately approved posting action.
