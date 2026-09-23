# Hubblefly FacilityOS

FacilityOS is Hubblefly's operational layer across Sales Requirement, Manufacturing Job,
engineering release control, PPC, physical inventory, manufacturing execution, quality/testing,
dispatch, Installed Base and MRO.

## Target architecture

The accepted production target is:

`Next.js + TypeScript -> FacilityOS application/domain services -> PostgreSQL/Supabase -> controlled ERPNext APIs`

- FacilityOS target operational data lives in PostgreSQL/Supabase.
- ERPNext/Frappe Cloud remains the authoritative ERP, accounting and official stock-ledger system.
- FacilityOS never writes the ERPNext database directly.
- The architecture is a modular monolith initially.
- Detailed physical locations belong to FacilityOS rather than being modelled as ERP Warehouse
  children.
- BOM is intended configuration; genealogy is actual installed configuration.
- As-Built is immutable; MRO creates As-Maintained history without overwriting As-Built.

See [docs/target-architecture.md](docs/target-architecture.md).

## Current repository coexistence

The repository still contains the substantial Inventory/Shopfloor prototype and the legacy
FacilityOS Frappe app under `frappe_app/facility_os`.

That Frappe backend is **SUPERSEDED as the target architecture**, but it remains intact as
migration/reference implementation. It must not be deleted until the corresponding target module
has been implemented, tested, migrated/cut over where required, and explicitly approved for
cleanup.

Historical details are preserved in
[docs/architecture.md](docs/architecture.md), clearly marked **SUPERSEDED / LEGACY REFERENCE**.

## W0-01 scope

The controlled target implementation branch is `foundation/wave0-target`.

W0-01 establishes repository/runtime foundations only:

- Node.js 24 LTS runtime intent
- pnpm dependency authority and deterministic lockfile
- Next.js 16 / React 19.2 / TypeScript 6 foundation
- typecheck, lint and formatting scripts
- target environment-validation schema foundation
- additive `src/` target structure
- architecture documentation alignment

W0-01 does **not** configure Supabase/Vercel, create PostgreSQL migrations, implement target Auth/RLS,
post to ERPNext, perform opening stock, migrate legacy data or remove legacy code.

## Legacy operational prototype

Existing routes/screens/providers for Inventory QR, physical count, locations, containers, GRN,
Route Cards, genealogy, Delivery Challan, Gate Pass, MIS and Admin remain unchanged by W0-01 except
for framework/toolchain compatibility required to keep the project building.

## Runtime

Target development runtime:

- Node.js 24 LTS
- pnpm 11.27.1
- dependency authority: `pnpm-lock.yaml`

Use `.env.example` only as a template. Real credentials must never be committed.

## Project control

Canonical operating rule:

`Chat decides -> Notion documents -> ClickUp executes -> GitHub implements -> Master tracks`

Implementation status must distinguish DESIGNED / PLANNED / IMPLEMENTED / TESTED / DEPLOYED /
PRODUCTION VERIFIED / SUPERSEDED / BLOCKED.
