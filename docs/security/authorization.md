# FacilityOS authorization — W0-07

Status: **IMPLEMENTED pending full CI verification**

This document is the source-code handover reference for FacilityOS application-level
authorization introduced by W0-07. It must be read together with the W0-06 authentication
documentation and the W0-05 Organisation / Legal Entity / Site model.

## 1. Security boundary

Authentication answers **who the caller is**. W0-06 owns Supabase Auth, `iam.user_profile`,
`AuthenticatedUser`, and trusted HUMAN `ActorContext`.

Authorization answers **what that authenticated FacilityOS user may do, and in what scope**.
W0-07 owns Roles, Capabilities, Role Assignments, scope matching, positive capability union,
default-deny decisions and reusable server-side authorization guards.

The browser, request body, query string, UI state, localStorage and unapproved JWT custom claims
are not authorization authorities. `AuthorizationService` resolves FacilityOS-controlled
server-side data on each decision.

W0-07 does **not** establish database row isolation. W0-08 owns production RLS and runtime database
roles. W0-09 owns immutable Approval Decisions, Holds and dual-approval workflow.

## 2. IAM schema

W0-07 adds four tables under `iam`:

- `iam.role`: named bundle identity and lifecycle.
- `iam.capability`: stable machine-readable permission registry.
- `iam.role_capability`: many-to-many Role to Capability mapping.
- `iam.role_assignment`: user-to-Role assignment with Organisation / Legal Entity / Site scope,
  validity and lifecycle.

All mutable authorization records carry `version` for optimistic concurrency and attribution
timestamps/actors. Role and Capability codes are immutable after creation. Role Assignments are
not hard-deleted by the W0-07 application service; revocation uses `INACTIVE` status.

## 3. Role model

A Role is a named bundle of capabilities. It has:

- immutable internal UUID;
- stable `code`;
- display name and optional description;
- `SYSTEM` or `CUSTOM` kind;
- `ACTIVE` / `INACTIVE` status;
- aggregate version and attribution.

Role names are not permission checks. Domain/application code should not branch on names such as
`STORE_MANAGER`. It should request the relevant capability.

W0-07 does not seed a speculative production organisation chart or auto-assign a bootstrap user.

## 4. Capability model

Capabilities are stable, machine-readable permission codes such as:

- `inventory.physical_count.view`
- `inventory.physical_count.record`
- `quality.inspection.record`
- `dispatch.gate_pass.authorise`
- `service.job.execute`

The production catalogue remains intentionally small. Future domain packages own their own
capabilities and register them through this mechanism rather than expanding W0-07 into a
speculative permission catalogue.

A requested capability must exist and be ACTIVE. Unknown or inactive capabilities fail closed.

## 5. Role to Capability mapping

`iam.role_capability` implements many-to-many Role ↔ Capability composition. Duplicate mappings
are prohibited by PostgreSQL. Inactive mappings, Roles or Capabilities do not grant.

Mapping lifecycle remains current-state security data in W0-07. W0-09 will provide canonical
immutable audit evidence; `updated_at` is not claimed as a complete audit trail.

## 6. Role Assignment model

A user may hold zero, one or many Role Assignments simultaneously. A Role Assignment contains:

`user_profile + role + organisation + optional legal entity + optional site + scope level +
valid_from + optional valid_until + status`.

No authorization Role is stored directly on `iam.user_profile`.

Assignment validity is a half-open interval:

`valid_from <= evaluation_time < valid_until`

where `valid_until` is optional. W0-07 uses the platform Clock and persists timestamps as
PostgreSQL `timestamptz`.

An inactive assignment grants nothing. Revocation is resolved from the database on the next
authorization decision; W0-07 introduces no long-lived authorization cache.

## 7. Scope representation and matching

Every assignment is anchored to exactly one Organisation. The optional Legal Entity and Site
references are constrained to that Organisation by PostgreSQL foreign keys and validated again by
application services.

`scope_level` is one of:

- **ORGANISATION** — Organisation only; Legal Entity and Site are null.
- **LEGAL_ENTITY** — Organisation + one Legal Entity; Site is null.
- **SITE** — Organisation + one Site; Legal Entity may be supplied when the authority is intended
  for that Legal Entity at the Site.

Requested resource scope is represented as `AuthorizationScope` with Organisation and optional
Legal Entity / Site.

Exact W0-07 matching semantics:

1. Organisation assignment may grant throughout that Organisation, subject to the requested
   resource scope being valid and any later deny policy.
2. Legal-Entity assignment grants only that same Legal Entity. It may apply to a requested Site
   only when the request also names the same Legal Entity and the W0-05 Site↔Legal Entity
   association is valid.
3. Site + Legal Entity assignment grants only that exact Site and Legal Entity pair.
4. Site-only assignment grants physical Site authority only for a request that does not claim a
   Legal Entity. A shared Site therefore never implies access to every Legal Entity using it.
5. Cross-Organisation scope never matches.
6. A narrower assignment never expands into broader Organisation or unrelated Legal Entity access.

This design deliberately separates physical Site relationships from legal-company data authority.

## 8. Effective capability union

Positive capabilities are the union of grants from all simultaneously valid, active, matching
Role Assignments.

One assignment never overwrites another. Duplicate database mappings/assignments do not create a
new class of authority.

A positive grant is only an input to the decision. It is not unconditional permission.

## 9. Default deny

Authorization is fail-closed. Denial includes, among other cases:

- no authenticated user;
- FacilityOS profile absent/inactive;
- trusted identity mismatch;
- unknown/inactive capability;
- no assignment;
- inactive/not-yet-valid/expired assignment;
- inactive Role;
- Role lacking the capability;
- invalid or mismatched scope;
- explicit segregation/policy denial.

Internal decisions preserve a denial reason for diagnostics and testing. Public exceptions use the
generic message: **You are not authorized to perform this action.**

## 10. AuthorizationService

`AuthorizationService` is the canonical application authorization resolver.

Conceptually:

```ts
authorize({
  user,
  capability,
  scope,
  resourceContext?,
}) -> AuthorizationDecision

require({
  user,
  capability,
  scope,
  resourceContext?,
}) -> AuthorizationDecision | throws AuthorizationDeniedError
```

The service reloads the FacilityOS profile, assignments, Roles, mappings and Capabilities from
server-side repositories. It validates requested scope against W0-05 Organisation / Legal Entity /
Site records and Site↔Legal Entity association before evaluating the grant.

`AuthorizationDecision` preserves outcome, requested capability, evaluated user, scope, matching
assignment IDs for safe internal use, SUPERUSER provenance, denial reason and evaluation time.

## 11. Server-side enforcement and UI hints

Protected application mutations must follow:

`trusted authenticated user -> AuthorizationService.require -> application service`.

`requireCapability` is a reusable server-side guard. UI code may consume the safe
`toAuthorizationHint` projection to hide or enable actions, but that hint is never enforcement.
Buttons, navigation and client-side route guards cannot replace the server check.

Request-supplied role, capability, user ID or scope does not itself grant access. The server treats
the requested scope as the resource to authorize and proves that it matches authoritative
assignments and W0-05 records.

## 12. Segregation of duty and distinct human

W0-07 provides identity primitives `isSameHuman` and `areDistinctHumans`. They compare trusted
HUMAN Actor identities.

One human holding two Roles, two assignments, two sessions or multiple scopes remains one human.
Multiple Roles can provide multiple capabilities, but they cannot satisfy a future
two-distinct-human approval requirement.

W0-09 will store approval decisions and enforce approval workflow. W0-07 only provides the
authorization/policy extension point it will consume.

## 13. SUPERUSER semantics

`platform.superuser` is a controlled positive-grant capability, not a bypass.

When the SUPERUSER capability is active and granted through an otherwise valid scoped assignment,
it may satisfy a **known, active** requested FacilityOS capability in that assignment's scope.

It does not:

- create unknown capabilities;
- cross assignment scope;
- reactivate inactive users, Roles, Capabilities or assignments;
- bypass assignment validity;
- bypass explicit deny policies or SoD;
- erase audit/evidence/history;
- override Holds, record-state, MFA/recent-auth, distinct-human or ERP financial authority.

The evaluator always executes deny-policy extension points after a positive SUPERUSER grant. There
is no global `if superuser return true` path.

## 14. Optimistic concurrency and lifecycle

Administrative mutations use W0-03 UnitOfWork and optimistic concurrency plus W0-04 Clock and
ActorContext. Stale versions raise the standard application concurrency conflict.

Assignments are deactivated rather than physically deleted. Role/Capability codes are protected by
database triggers against renaming after use.

W0-09 must capture immutable historical evidence for authorization administration changes. W0-07
does not claim that mutable rows alone satisfy the final audit requirement.

## 15. PostgreSQL constraints and indexes

Persistent invariants include:

- unique Role code;
- unique Capability code;
- unique Role↔Capability pair;
- valid status/kind/scope values;
- non-negative versions;
- valid validity interval;
- valid user/Role references;
- same-Organisation Legal Entity and Site references;
- valid Site↔Legal Entity pair where both are present;
- duplicate exact assignment protection.

Indexes exist for user/time assignment lookup, scope lookup, role capability expansion and
Capability code lookup. These are the W0-07 authorization paths; speculative indexing is avoided.

## 16. RLS preparation — W0-08 boundary

W0-08 may consume:

- `iam.user_profile.auth_user_id` to map authenticated Supabase identity to FacilityOS user;
- `iam.role_assignment` for active/valid Organisation / Legal Entity / Site scope;
- `iam.role_capability`, `iam.role` and `iam.capability` for capability-aware database policy
  helpers where appropriate.

W0-07 does not create production RLS policies or browser database authority.

Some rules should remain application-level even after W0-08: resource state-machine conditions,
complex SoD, distinct-human approval, Holds, recent-auth/MFA and context-dependent business policy.
RLS should be defense in depth, not a duplicate workflow engine.

## 17. Approval/Hold boundary — W0-09

W0-09 owns immutable Approval Decisions, Holds, dual approval and release gates. W0-07 does not
create approval records and does not infer that two Roles equal two approvers.

## 18. ERP boundary

FacilityOS authorization is independent from ERPNext authorization. W0-07 creates no ERP Role,
permission, user, Company/Warehouse permission sync, credential or posting path.

## 19. Legacy boundary

Legacy Frappe roles/users/permission code are not migrated or removed in W0-07. Target FacilityOS
authorization supersedes legacy permission architecture only after replacement is verified and a
migration/cutover is explicitly authorized.

## 20. Local developer walkthrough

1. Install with `pnpm install --frozen-lockfile`.
2. Start/reset local Supabase with the repository scripts.
3. Provision a local auth user using the W0-06 controlled bootstrap/test mechanism.
4. Register a representative Capability through `AuthorizationAdministrationService`.
5. Create a Role and map the Capability.
6. Create a scoped Role Assignment for the provisioned profile.
7. Build the W0-06 `AuthenticatedUser`.
8. Call `AuthorizationService.require` for a matching action/scope and observe ALLOW.
9. Call it for an unrelated scope/capability and observe generic authorization denial.
10. Deactivate the assignment and repeat the formerly allowed action; the next resolution denies.
11. Run `pnpm test:authorization:unit` and `pnpm test:authorization:integration`.

Production bootstrap/admin UI is not part of W0-07.

## 21. Tests and evidence

Unit tests cover default deny, lifecycle/validity, multiple-role union, scope matching,
SUPERUSER deny extension points and distinct-human identity semantics.

Local PostgreSQL/Supabase integration tests exercise the migration and real constraints, scoped
resolution, shared-Site behavior, revocation, validity, forged inputs, immutable codes and
optimistic concurrency.

The W0-07 CI workflow also runs W0-03 through W0-06 regressions, typecheck, lint, production build,
legacy Frappe compile/DocType JSON validation, deterministic database schema fingerprint and
generated-type drift.

## 22. Known limitations / future production concerns

- W0-08 production RLS/runtime DB roles are not implemented.
- W0-09 immutable audit/Approval/Hold infrastructure is not implemented.
- No production authorization administration UI is included.
- No complete future domain Capability catalogue is seeded.
- No authorization cache exists; this is intentional for immediate revocation semantics in Wave 0.
- SUPERUSER remains an application authorization concept and does not grant ERP authority.
- Deployment/production verification is outside W0-07.

## 23. Troubleshooting

If an expected grant denies, inspect the internal decision reason server-side and verify, in order:
active FacilityOS profile, known active Capability, valid requested scope, assignment lifecycle and
validity, Role status, Role↔Capability mapping, scope match and explicit deny policies.

Do not solve authorization failures by trusting client Role/Capability data, widening Site scope,
adding unconditional SUPERUSER bypasses, disabling validity checks or bypassing server guards.
