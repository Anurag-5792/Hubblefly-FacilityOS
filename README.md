# Hubblefly FacilityOS

Hubblefly FacilityOS is a responsive, QR-first web application for inventory, shopfloor, container/location tracking, manufacturing genealogy, gate passes and delivery challans, with ERPNext as the stock and accounting backbone.

## Product roles

- Inventory: count, receive, move, issue, return, search, gate pass and delivery challan
- Shopfloor: build SFG, install/remove/replace components, consume material, route card and genealogy
- MIS: read-only, requirement-driven dashboards with selectable filters, KPI figures, tables and graphs
- Admin: item master, location master, container master, SFG/BOM, users/roles, print templates, ERPNext sync and audit

## Core architecture

`FacilityOS Web App -> FacilityOS server/business logic -> ERPNext adapter -> ERPNext`

ERPNext remains authoritative for Item, Warehouse, Serial No, Batch, Stock Ledger and ERP-linked stock transactions. FacilityOS adds QR scanning, rack/position/container tracking, operator workflows, genealogy and printable operational documents.

## Physical location model

`Warehouse -> Rack -> Level -> Position -> Stack Slot -> Container -> Item`

Example: `R05-L2-P03-S2`.

- Position QR: `R05-L2-P03`
- S1: bottom container
- S2: top container

## Current MVP development

Issue #1 / branch `feature/issue-1-inventory-qr-mvp` currently includes:

- responsive Orange + Dark Blue application shell
- universal QR resolver
- progressive camera QR scanner with manual/hardware-scanner fallback
- Move Stock validation workflow
- Physical Count validation workflow
- server-only ERPNext adapter boundary with environment-based credentials
- installable FacilityOS Frappe app scaffold with operational and read-model DocTypes
- Frappe-backed user sessions and FacilityOS role enforcement
- persistent physical-count sessions without automatic ERP stock adjustment
- two-stage Inventory Person → separate Admin validation with immutable audit history
- audited FacilityOS container-to-position moves
- ERPNext-derived FacilityOS read-model synchronization for MIS
- Admin connection-health and synchronization controls
- GitHub Actions checks for Next.js build, Frappe Python syntax and DocType JSON

## ERPNext / Frappe environment

Copy `.env.example` to `.env.local` for local development and supply server credentials there. Never expose ERPNext API credentials through browser code or commit real credentials.

The installable Frappe backend lives under `frappe_app/facility_os`. See `docs/frappe-deployment.md` for installation, role assignment, validation and production-gate instructions.

## Release rule

No cost-generating or irreversible output is released from an assumption. Bulk labels, opening stock, serial creation and stock posting require preview/validation before production use.

## Project control

ClickUp folder: `FacilityOS — ERPNext & Store Operations`

Development lifecycle: Backlog -> Ready -> In Development -> Code Review -> Ready for UAT -> UAT -> Ready for Release -> Production -> Closed.
