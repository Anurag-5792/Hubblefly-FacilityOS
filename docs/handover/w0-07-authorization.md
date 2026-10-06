# W0-07 handover — Roles / Capabilities / Scoped Authorization

Status: **IMPLEMENTED pending TESTED gate evidence**

## Package boundary

W0-07 implements application-level FacilityOS authorization only.

Included:

- IAM Role, Capability, Role↔Capability and Role Assignment schema;
- multiple simultaneous Role Assignments;
- Organisation / Legal Entity / Site scope;
- assignment validity and lifecycle;
- canonical AuthorizationService and server guard;
- effective positive capability union and default deny;
- SoD/distinct-human foundation;
- bounded SUPERUSER semantics;
- optimistic concurrency;
- PostgreSQL constraints and tests;
- handover documentation.

Excluded:

- production RLS/runtime DB roles (W0-08);
- immutable Approval/Hold/dual-approval infrastructure (W0-09);
- ERPNext authorization mapping;
- production admin UI;
- hosted Supabase/Vercel/production configuration;
- legacy permission migration/deletion.

## Important files

- `supabase/migrations/20261007003000_w0_07_authorization_foundation.sql`
- `src/domains/iam/authorization-model.ts`
- `src/domains/iam/authorization-evaluator.ts`
- `src/domains/iam/authorization-repository.ts`
- `src/domains/iam/authorization-service.ts`
- `src/domains/iam/authorization-admin-service.ts`
- `src/domains/iam/authorization-guard.ts`
- `src/domains/iam/sod.ts`
- `tests/unit/authorization/authorization.test.ts`
- `tests/integration/authorization/authorization.test.ts`
- `docs/security/authorization.md`
- `docs/adr/0001-capability-based-scoped-authorization.md`

## Operational invariants

1. AuthenticatedUser remains authentication identity, not an authorization snapshot.
2. No client-supplied Role/Capability/scope grants authority.
3. Capability checks are authoritative; Role-name checks are not.
4. Positive capability union never overrides explicit deny policies.
5. Unknown/inactive/missing/inconsistent authorization state fails closed.
6. Shared Site does not create cross-Legal-Entity authority.
7. One human remains one human regardless of Roles/sessions/assignments.
8. SUPERUSER is not a bypass.
9. Revocation is evaluated from authoritative database state on the next decision.
10. W0-07 is not database isolation; do not describe it as RLS complete.

## Extension guidance

When a future domain introduces a new permission:

1. define a stable domain-owned Capability code;
2. register it through controlled administration/bootstrap;
3. compose it into appropriate Roles;
4. enforce it through AuthorizationService at the application-service boundary;
5. add scope and negative tests;
6. do not add Role-name conditionals.

When W0-08 adds RLS, consume structured IAM data rather than duplicating a second incompatible
authorization model.

When W0-09 adds Approval/Hold controls, implement them as deny/gate policy on top of capability
authorization; do not model two Roles as two humans.

## Test commands

```bash
pnpm install --frozen-lockfile
pnpm db:verify:runtime
pnpm test:authorization:unit
pnpm test:authorization:integration
pnpm test:auth:integration
pnpm test:core:integration
pnpm test:db:unit
pnpm test:db:integration
pnpm test:platform:unit
pnpm typecheck
pnpm lint
pnpm build
```

The dedicated W0-07 GitHub workflow additionally validates legacy Frappe Python and exactly 23
legacy DocType JSON files, checks committed secret patterns, generated-type drift and repository
drift.

## Handover readiness checklist

- [x] Authorization architecture is documented without ChatGPT dependency.
- [x] Exact scope matching semantics are documented.
- [x] Schema and database invariants are documented.
- [x] Auth vs authorization boundary is explicit.
- [x] Revocation/validity behavior is explicit.
- [x] SoD/distinct-human and SUPERUSER semantics are explicit.
- [x] W0-08, W0-09, ERP and legacy boundaries are explicit.
- [x] Local developer test/onboarding steps are documented.
- [x] Troubleshooting guidance exists.
- [ ] Full CI evidence attached to the final W0-07 status.
- [ ] Deployment/production verification — intentionally outside this package.

A new engineering team should treat `docs/security/authorization.md` as the canonical detailed
reference and this file as the bounded package handover index.
