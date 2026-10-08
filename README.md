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

## W0-07 authorization development

W0-07 adds the application-level authorization foundation under `src/domains/iam`.
Authentication remains owned by W0-06; authorization resolves FacilityOS-controlled server-side
Role Assignments and Capabilities on each protected operation. PostgreSQL production RLS is
deliberately deferred to W0-08.

For the authorization model, scope semantics, local bootstrap/test procedure and troubleshooting,
see [docs/security/authorization.md](docs/security/authorization.md). The package handover record is
[docs/handover/w0-07-authorization.md](docs/handover/w0-07-authorization.md).

Run the local authorization suite with:

```bash
pnpm test:authorization:unit
pnpm test:authorization:integration
```

## W0-08 database RLS development

W0-08 status: **TESTED** (GitHub Actions run #20, 2026-10-07). It is not DEPLOYED or PRODUCTION VERIFIED.

W0-08 adds PostgreSQL row-level security/runtime-role defence beneath W0-07. Protected
user-scoped persistence uses the existing UnitOfWork through `withRlsTransaction`; requested
browser scope is never trusted as database authority.

`core`, `iam` and private `facilityos_security` remain outside the Supabase Data API.
Ordinary runtime is NOBYPASSRLS, protected Wave-0 tables use RLS + FORCE RLS, and
`platform.superuser` never becomes PostgreSQL superuser/BYPASSRLS.

See [docs/security/rls.md](docs/security/rls.md),
[ADR-0002](docs/adr/0002-rls-runtime-context.md), and
[docs/handover/w0-08-rls.md](docs/handover/w0-08-rls.md).

Run `pnpm test:rls:unit` and `pnpm test:rls:integration`.

## SDLC governance and contribution

See [R1 governance index](docs/governance/README.md) for the MASTER-approved R1 SDLC design v1.2 implementation, DoR/DoD, templates, independent specialist review, exact-SHA evidence, ownership Option B and R2–R6 exclusions.
