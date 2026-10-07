# ADR-0003 — Canonical Audit, immutable Approval decisions and operational Holds

Status: **Accepted for W0-09 implementation**

## Context

FacilityOS needs cross-cutting governance before domain workflows can safely implement Engineering,
Quality, manufacturing release, dispatch or MRO gates. Existing logs are not canonical evidence;
mutable activity rows cannot prove historical approval; W0-07 authorization alone does not model
segregation of duty; and W0-08 RLS alone does not express Holds.

## Decision

1. Use a private `governance` PostgreSQL schema for W0-09. This is a technical physical-schema
   refinement; the business architecture is unchanged.
2. Canonical Audit is a dedicated append-only table. Normal runtime has no arbitrary DML; HUMAN
   append is a narrow scoped SECURITY DEFINER path and UPDATE/DELETE are DB-trigger rejected.
3. Approval Request is mutable minimal current state; Approval Decision is separate immutable
   evidence. Identity for distinct-human enforcement is immutable FacilityOS human identity, not
   Role/session.
4. Hold current state is separate from immutable Hold action history. Release is an explicit
   controlled transition and may require approved release evidence.
5. W0-07 AuthorizationService remains mandatory at the application layer; controlled DB functions
   independently verify direct scoped Capabilities. `platform.superuser` is not a substitute for
   approval/Hold authority.
6. All protected governance tables adopt W0-08 runtime-role, FORCE RLS and private-Data-API rules.
   Governance SECURITY DEFINER functions use a dedicated NOLOGIN/NOINHERIT/NOBYPASSRLS
   `facilityos_governance_executor` with only the exact table/helper privileges needed; runtime
   and login roles do not inherit it.
7. Governed state mutation and required canonical Audit share the existing W0-03 UnitOfWork.
8. Audit, Approval/Hold state and future W0-11 event/outbox transport remain separate concepts.

## Consequences

Future domain modules gain reusable primitives without a generic workflow engine. Historical
decision/failure evidence is not cleaned up by editing. Direct SQL from normal runtime cannot
fabricate decisions or rewrite evidence. More business-specific policy catalogues remain future
domain work, and legal Audit retention/purge is intentionally unresolved.

The `governance` schema must be included in deterministic migrations, generated database types,
schema fingerprinting, DB lint, RLS/adversarial tests and handover documentation.
