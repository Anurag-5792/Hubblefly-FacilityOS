# ADR-0002 — Transaction-local RLS identity and split runtime roles

- Status: Accepted for W0-08
- Date: 2026-10-07
- Verification: TESTED — W0-08 GitHub Actions run #20, 2026-10-07

## Context

W0-07 owns application capability authorization. W0-08 must prevent ordinary query mistakes from
crossing FacilityOS scope without creating a second authentication, transaction or database stack.
Client-requested business scope and session-global mutable context are not trustworthy.

## Decision

Protected tables use ENABLE + FORCE RLS. Migration authority remains separate.
`facilityos_user_runtime` is NOLOGIN/NOBYPASSRLS ordinary user runtime.
`facilityos_security_admin` is a separate NOLOGIN/NOBYPASSRLS elevated path.

Identity is established inside the W0-03 UnitOfWork with fixed SET LOCAL ROLE and a fixed
SECURITY DEFINER function. The function resolves Auth UUID → user_profile and creates a
function-owned temporary context table ON COMMIT DROP.

Organisation/Legal Entity/Site authority is not accepted into context. RLS derives it from W0-07
assignments, Role lifecycle and validity. W0-07 AuthorizationService remains mandatory above RLS.

## Consequences

Pooled connections/rollback cannot retain prior-user authority; ordinary runtime is neither owner
nor BYPASSRLS; shared Sites preserve Legal Entity isolation; SUPERUSER never becomes database
superuser; IAM administration requires a separate elevated path; core/iam/security schemas stay
outside the Supabase Data API.

## Rejected alternatives

- user_profile.role or Role-name SQL checks;
- session-global/custom-GUC business scope;
- service_role as normal data path;
- PostgreSQL BYPASSRLS for FacilityOS SUPERUSER;
- moving SoD/Holds/approval workflow into SQL.
