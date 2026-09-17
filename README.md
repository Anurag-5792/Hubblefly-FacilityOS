# Hubblefly FacilityOS

Hubblefly FacilityOS is a responsive, QR-first web application for inventory, shopfloor, container/location tracking, manufacturing genealogy, gate passes and delivery challans, with ERPNext as the stock and accounting backbone.

## Product roles

- Inventory: count, receive, move, issue, return, search, gate pass and delivery challan
- Shopfloor: build SFG, install/remove/replace components, consume material, route card and genealogy
- Admin: item master, location master, container master, SFG/BOM, users/roles, print templates, ERPNext sync and audit

## Core architecture

FacilityOS Web App -> FacilityOS API/business logic -> ERPNext

ERPNext remains authoritative for Item, Warehouse, Serial No, Batch, Stock Ledger and ERP-linked stock transactions. FacilityOS adds QR scanning, rack/position/container tracking, operator workflows, genealogy and printable operational documents.

## Physical location model

`Warehouse -> Rack -> Level -> Position -> Stack Slot -> Container -> Item`

Example: `R05-L2-P03-S2`.

- Position QR: `R05-L2-P03`
- S1: bottom container
- S2: top container

## Release rule

No cost-generating or irreversible output is released from an assumption. Bulk labels, opening stock, serial creation and stock posting require preview/validation before production use.

## Project control

ClickUp folder: `FacilityOS — ERPNext & Store Operations`

Development lifecycle: Backlog -> Ready -> In Development -> Code Review -> Ready for UAT -> UAT -> Ready for Release -> Production -> Closed.
