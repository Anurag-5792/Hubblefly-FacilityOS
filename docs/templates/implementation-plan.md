# Implementation Plan — <Issue>

## Identity and approval
- Requirement/design/ADR and approved revision:
- Issue URL, implementation authorisation:
- Repository, authorised branch, exact starting base SHA:
- Implementer and implementation agent/session:
- Planned PR target branch:
- Independent specialist ChatGPT reviewer chat IDs, source-inspection scopes and separation from implementing agent:
- Actual platform-required human GitHub reviewer (if any), and 00 — MASTER final PR authority:
- DoR verdict and evidence:

## Business intent and constraints
- Users, operational problem, business value:
- In-scope and out-of-scope:
- Relevant product maturity and legacy coexistence:
- Stop conditions requiring return to design authority:

## Design and dependency boundaries
- Inward domain/application interfaces/ports:
- Infrastructure implementation adapters/composition root:
- Compile-time dependency check (no domain→Kysely/pg/Supabase/Next imports):
- Runtime sequence/transaction ownership (W0-03 UoW):
- External calls, outbox/idempotency/retries/partial failure:
- Exact planned module/files (no R1 structural changes):

## System-of-record and Inventory truth
- Physical location/container/serial/batch truth:
- Quality Accepted/Rejected/Hold/Return paths:
- Reservation/issue/consumption transitions:
- ERP official stock/accounting authority:
- ERP posting eligibility, authorisation, API, success/failure reconciliation:
- Forbidden transitions and distinct-human approvals:
- Legacy Frappe migration/reference mapping:

## Database, security, dependencies
- Migrations, schema/grants/RLS, typed artifact updates:
- Authenticated identity, authorization, scope, SoD:
- SECURITY DEFINER/privilege escalation negative tests:
- Dependency changes, licence/security/lockfile assessment:
- Configuration/secrets and environment requirements:

## Ordered implementation steps
1. 
2. 
3. 

## Acceptance-criterion trace matrix
| AC ID | Code paths / implementation step | Positive test | Negative test | CI command/run/artifact | Reviewer evidence |
|---|---|---|---|---|---|
| AC-01 | | | | | |
| AC-02 | | | | | |

## Validation and release effects
- Local commands (frozen install, types, lint, build):
- Database/migration/security suites:
- W0-01–W0-08 regression/legacy checks:
- Reachable PR-head CI workflow/checks and tested merge-ref provenance:
- Planned independent specialist current-HEAD review(s), MASTER decision, and conditional native-GitHub approval verification:
- UAT/sandbox tests and environment safety:
- Docs/ADR/handover updates:
- Application/schema/ERP API/config compatibility:
- Rollback, restore, ERP compensation and audit:

## Risks, assumptions and escalation
- Risks and mitigations:
- Unverified assumptions:
- Blocking dependencies:
- Explicit stop rules if scope/security/authority changes:
- Plan approval owner/date/link:
