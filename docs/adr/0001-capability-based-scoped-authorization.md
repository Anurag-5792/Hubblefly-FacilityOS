# ADR-0001 — Capability-based scoped authorization

- Status: Accepted for W0-07
- Date: 2026-10-07
- Scope: FacilityOS application-level authorization

## Context

FacilityOS requires users to hold multiple operational responsibilities at the same time, with
authority that may differ by Organisation, Legal Entity and Site. A Site may physically serve
multiple Legal Entities, so Site membership cannot be treated as implicit cross-company data
authority.

W0-06 intentionally keeps `AuthenticatedUser` free of authorization snapshots. Future W0-08 RLS
and W0-09 Approval/Hold controls must be able to deny even when an application capability exists.

## Decision

FacilityOS uses:

`AuthenticatedUser -> Role Assignments -> Roles -> Capabilities -> explicit scope evaluation ->
AuthorizationService -> ALLOW/DENY`.

Authorization code checks Capabilities, not Role names.

A user can hold multiple simultaneous Role Assignments. Effective positive capabilities are the
union of active valid assignments that match the requested scope.

Assignment scope is explicit:

- Organisation;
- Legal Entity;
- Site, optionally bound to a Legal Entity.

Organisation scope can apply downward within the Organisation. Legal-Entity scope never crosses
Legal Entity. Site scope never expands beyond the Site; a Site-only grant does not infer Legal
Entity authority. Site + Legal Entity authority requires that exact pair.

Authorization is default-deny and resolved from authoritative server-side data without a Wave 0
long-lived grant cache.

`platform.superuser` is a positive capability that may satisfy known active FacilityOS
capabilities inside its assignment scope. It still traverses explicit deny-policy/SoD extension
points and is not an unconditional bypass.

Distinct-human rules compare trusted HUMAN identity. Multiple Roles/sessions/assignments never turn
one human into two approvers.

## Consequences

Benefits:

- business operations can compose responsibilities without a one-role-per-user restriction;
- domain code remains stable when Role composition changes;
- revocation takes effect on the next server-side decision;
- shared Sites do not leak authority across Legal Entities;
- W0-08 and W0-09 can add stronger deny boundaries without redesigning positive grants.

Costs:

- authorization requires server-side resolution and several relational lookups;
- administrators must manage Role composition and scoped assignments deliberately;
- final audit evidence and database row isolation remain separate work packages.

## Rejected alternatives

### One Role on user_profile

Rejected because users need simultaneous roles/scopes and one field causes overwrites or Role
explosion.

### Role-name checks in application code

Rejected because Role names are organisational packaging, not stable permission contracts.

### Site implies Legal Entity access

Rejected because one Site may serve multiple Legal Entities; physical co-location is not legal-data
authority.

### SUPERUSER unconditional bypass

Rejected because it would defeat SoD, Holds, workflow state, future MFA/recent-auth and immutable
evidence controls.

### Long-lived authorization snapshot in JWT/client session

Rejected for Wave 0 because revocation/expiry could remain effective after authoritative state
changed.
