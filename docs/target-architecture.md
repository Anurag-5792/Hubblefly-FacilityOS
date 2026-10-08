# FacilityOS Target Architecture

**Status: TARGET / ACCEPTED ARCHITECTURE BASELINE**

This document identifies the target production direction. Historical Frappe-target documents and
code remain in the repository as migration/reference material until their replacements are
implemented, tested, cut over and explicitly approved for cleanup.

## Target platform

FacilityOS is a modular monolith built on:

- Next.js + TypeScript
- PostgreSQL, initially hosted through Supabase
- Supabase Auth and private object storage behind FacilityOS service abstractions
- Vercel for the Next.js runtime
- GitHub for source control and CI/CD
- ERPNext/Frappe Cloud as the separate authoritative ERP

## System-of-record boundary

### ERPNext remains authoritative for

- accounting and valuation
- official stock ledger
- Item, Customer and Supplier masters
- Purchase Orders
- official Purchase Receipts / Stock Entries
- Sales Orders / invoicing
- ERP Work Orders and official manufacturing valuation/transactions
- Delivery Notes and other official ERP transactions

FacilityOS must never write the ERPNext database directly. Future authorised integration uses
controlled APIs/services.

### FacilityOS remains authoritative for

- Sales Requirement and Manufacturing Job
- Engineering Release eligibility and controlled production baseline references
- PPC operational planning
- detailed physical location and QR operations
- Operational GRN and IQC evidence
- reservation and kitting
- Route Cards, shopfloor execution and genealogy
- As-Built
- NCR / rework / test evidence
- Manufacturing Complete and FG Release workflow
- Gate Inward, Delivery Challan, Gate Pass and physical dispatch controls
- Installed Base
- Service / MRO / warranty technical history
- As-Maintained
- reliability and immutable operational audit evidence

## Physical inventory truth

ERP Warehouse is an accounting/custody boundary, not the parent of FacilityOS physical locations.

Target hierarchy:

`Site -> Store/Zone -> Rack -> Level/Shelf -> Position/Bin -> Container -> Item/Serial/Batch presence`

The target keeps commercial, ERP stock, physical-location, quality, reservation and production
consumption truths distinct.

## Application direction

`Presentation -> Application Services -> Domain -> Repositories/Infrastructure`

Business rules must not live in React components, Route Handlers or unrestricted database helpers.

## Security direction

One user may have multiple simultaneously active, scoped role assignments. Positive capabilities
accumulate only within their scopes; holds, immutable-evidence rules, state rules and
segregation-of-duty override accumulated permissions. One human identity can never satisfy both
sides of a distinct-human dual approval.

## Migration coexistence

Legacy Frappe implementation remains physically present until each target module is verified.

A migrated module may have only one authoritative write store. Temporary shadow comparison is
permitted; uncontrolled dual authority is not.

## Current implementation status

Wave 0 is the target foundation programme.

W0-01 — Repository & Runtime Foundation is the only authorised implementation package at the time
this document was introduced.

W0-01 does not implement PostgreSQL schema, Supabase Auth, RLS, ERP posting, opening stock,
legacy-data migration or production deployment.

See `docs/architecture.md` for the historical Frappe-target architecture, now marked
**SUPERSEDED / LEGACY REFERENCE**.
