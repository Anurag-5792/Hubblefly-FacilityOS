# W0-09 — Immutable Audit / Approval / Holds handover

Status: **IMPLEMENTED — TEST VERIFICATION PENDING**

Authorised baseline:
- branch: `foundation/wave0-target`
- starting SHA: `864fc2c4087b43009433db2c98d3caf3239bb2fc`
- W0-01 through W0-08: TESTED at start
- W0-10 onward: not authorised

## What W0-09 adds

- private `governance` schema;
- append-only canonical `audit_event`;
- minimal `approval_request` state plus immutable `approval_decision`;
- current `hold` plus immutable `hold_action`;
- exact-capability DB helpers integrated with W0-07 identities/scopes;
- FORCE-RLS visibility and private Data API boundary;
- controlled HUMAN/SYSTEM audit append;
- approval idempotency, locking, self-approval and distinct-human enforcement;
- Hold placement/release/idempotency/concurrency and reusable blocking policy;
- application services: `AuditRecorder`, `ApprovalService`, `HoldService`,
  `GovernancePolicyService`;
- canonical Audit emitted in the same UnitOfWork for W0-09 governed mutations.

No ERP posting, object/evidence storage, complete business workflow, legacy cleanup or production
deployment is included.

## Adoption checklist for future domain engineers

Before implementing a governed mutation, answer all of the following:

1. What mutation/action must be represented in canonical Audit?
2. Which direct Capability authorises the actor and at which Organisation/Legal Entity/Site scope?
3. Which Approval policy, if any, gates the action?
4. Is self-approval permitted?
5. How many approvals and distinct humans are required?
6. Which active Hold types/actions block progression?
7. Does Hold release require an approved request reference?
8. Which records must commit atomically with Audit?
9. Which records are immutable evidence versus mutable current state?
10. Which FORCE-RLS/read policy protects each record?
11. Which positive, negative, direct-SQL, cross-scope and concurrency tests prove the new domain use?

Use `withRlsTransaction`, `AuthorizationService.requireWithin`, governance policy/service
primitives and one shared UnitOfWork. Never begin a second normal-path transaction just to append
Audit.

## Verification command set

The dedicated `.github/workflows/w0-09-governance.yml` gate runs frozen install/tool versions,
two-reset deterministic migrations/types/fingerprint, W0-09 unit + PostgreSQL integration and
adversarial/concurrency tests, W0-03 through W0-08 regressions, generated-type drift, TypeScript,
ESLint with the existing 40-warning ceiling, production build, legacy Frappe compile, all 23 legacy
DocType JSON validations, documentation checks, secret-pattern scan and repository drift.

Until that gate passes on the implementation commit, this package is not TESTED.

## Deployment and legacy boundary

W0-09 is NOT DEPLOYED and NOT PRODUCTION VERIFIED. No hosted Supabase or Vercel production
migration is authorised. Legacy Frappe audit/workflow/permission records and DocTypes remain intact
for migration/reference; W0-09 does not delete or auto-migrate them.

## W0-10 boundary

Do not begin W0-10 Evidence Storage from this package. W0-10 remains separately gated.
