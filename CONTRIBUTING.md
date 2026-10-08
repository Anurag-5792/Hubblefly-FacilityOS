# Contributing to Hubblefly FacilityOS

This repository follows the **MASTER-approved R1 SDLC Governance Design v1.2** (8 October 2026). Implementation requires a bounded MASTER decision; do not treat this file as authorisation to change code.

## Required sequence

1. Recover business purpose, approved requirement/design/ADR, assigned capability and authoritative data facts.
2. Create a governed [implementation issue](.github/ISSUE_TEMPLATE/implementation.md) from **Design v1.2 Appendix A**, recording every DOR-01 through DOR-15 and a stable AC-ID→test/evidence matrix.
3. Record the DoR outcome READY FOR IMPLEMENTATION / NOT READY / BLOCKED; READY is a workflow gate, not deployment maturity.
4. Follow the [implementation-plan template](docs/templates/implementation-plan.md), reproduced exactly from **Design v1.2 Appendix B**. Obtain explicit implementation authority and pin the exact base SHA before branching.
5. Make only authorised source changes; avoid uncontrolled scope growth, direct protected-branch writes, legacy deletion or unaccepted architecture decisions.
6. Open the [PR template](.github/PULL_REQUEST_TEMPLATE.md), reproduced exactly from **Design v1.2 Appendix C**. Attach current HEAD/base/tested merge refs, immutable test/run evidence and DOD-01 through DOD-16.
7. Obtain independently assigned specialist ChatGPT review(s) which inspect actual source and PR changes at that exact HEAD. They return APPROVE / REQUEST CHANGES / BLOCKED. A chat review is not a native GitHub approval.
8. Verify applicable platform rules. Native human GitHub APPROVE is required **only when enforced by verified actual platform configuration**; otherwise record NOT REQUIRED with evidence; if unverifiable record UNVERIFIED and **BLOCK merge**.
9. 00 — MASTER independently makes the **final programme PR decision**. Repository owner may merge only on accepted exact HEAD and satisfied actual GitHub rules. After any new HEAD commit redo applicable CI/reviews/MASTER acceptance.

## Environment and read-only validation

Baseline runtime: Node.js 24.x, pnpm 11.27.1, Next.js/TypeScript; preserve `pnpm-lock.yaml`. Standard commands on an authorised test checkout:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:db:unit
pnpm test:platform:unit
pnpm test:core:unit
pnpm test:auth:unit
pnpm test:authorization:unit
pnpm test:rls:unit
```

Database verification/integration suites require authorised local Supabase/Docker and must never point at production: `pnpm db:verify:runtime`, `pnpm test:db:integration`, `pnpm test:core:integration`, `pnpm test:auth:integration`, `pnpm test:authorization:integration`, `pnpm test:rls:integration`. Existing GitHub workflows provide authoritative current-HEAD CI evidence; local runs alone cannot replace CI. Run `pnpm supabase:stop` after local DB testing.

## Non-negotiable engineering restrictions

- **Compile-time:** domain/application ports depend inward; no Kysely, `pg`, Supabase, Next.js runtime or concrete infrastructure imports in domain/application contracts. **Runtime:** presentation → application → domain/authorization → W0-03 UnitOfWork transaction port → repository port → Kysely/pg adapter → PostgreSQL. Runtime calls do not authorise outward imports.
- Default-deny server-side W0-07 scoped authorization, distinct-human approvals, W0-08 RLS/FORCE RLS and NOBYPASSRLS runtime; no `platform.superuser` DB bypass.
- Inventory Management is mandatory; keep physical/quality/availability/consumption/posting status separate. ERPNext owns official stock ledger, accounting and valuation; no FacilityOS direct ERPNext DB writes. External writes use authorised APIs, idempotency and reconciliation, not network calls during open transactions.
- Migration changes require source control, clean-install/upgrade, privilege/RLS and generated-type checks, reversible/recoverable design; destructive changes separately authorised.
- Report new dependencies' purpose, licence, advisories, maintenance and lockfile effect. Never commit credentials, private inventory spreadsheets or production data.
- Preserve `frappe_app/` and legacy evidence until verified replacement, tested migration and explicit cutover/cleanup authority.
- An implementation issue must declare architecture/DB/Inventory/ERPNext/security/legacy/CI/release effects or a reasoned **not affected**.
- Do not enable GitHub rulesets, alter CODEOWNERS, consolidate CI (R5), change `src/modules/` architecture (R4), do cleanup (R3), work W0-09 (R6) or deploy production under an R1 documentation authority.

See the [complete governance index](docs/governance/README.md), [engineering rules](docs/governance/engineering-standards.md), [DoR/DoD](docs/governance/readiness-and-done.md), [review evidence](docs/governance/review-and-evidence.md), and [ownership policy](docs/governance/ownership-and-approvals.md).
