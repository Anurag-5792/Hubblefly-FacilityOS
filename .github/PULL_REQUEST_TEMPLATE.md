# Pull Request — <bounded approved issue>

## Authority
- Requirement / design / ADR and accepted version:
- Implementation authorisation and issue:
- Approved implementation plan:
- Base branch / full base SHA:
- Exact current PR HEAD SHA (40 chars):
- Implementer(s), agent sessions and commit authors:
- Independent specialist ChatGPT reviewer chats/executions, specialisms and independence evidence:
- Implementer/reviewer session separation and actual code-inspection evidence:
- GitHub branch protection/ruleset verification and native approval requirement (REQUIRED / NOT REQUIRED / UNVERIFIED):
- Actual GitHub approving human/URL if enforced (otherwise NOT REQUIRED; do not fabricate):
- 00 — MASTER final programme PR verdict, exact HEAD, decision URL/time:

## Business and implemented scope
- Purpose/value, user workflows and status:
- In-scope delivered:
- Explicit exclusions:
- Differences from plan and authorisation:

## Architecture / data authority
- Compile-time inward dependency conformity:
- Runtime UoW and external transaction effects:
- FacilityOS-owned physical/location/operational facts:
- ERPNext official ledger/valuation/document effects:
- Direct ERP database writes? MUST BE NO:
- Quality disposition (Accepted / Rejected / Hold / Return):
- Reservations/issue/consumption/reconciliation and adjustment:
- Posting eligibility vs API submission vs successful ERP posting:
- Legacy Frappe preservation and cutover consequences:

## Security and supply chain
- Identity/capability/scope/SoD/RLS impact:
- Privileged functions/grants/migration changes:
- Secret safety and negative tests:
- Dependencies added/updated, version/licence/advisory and lockfile effect:

## Acceptance criterion → implementation → test → evidence
| AC ID | Code/commit | Test case(s) | Positive and negative results | CI artifact/run link | Reviewer verdict |
|---|---|---|---|---|---|
| AC-01 | | | | | |
| AC-02 | | | | | |

## Current-head reproducible verification
- `pnpm install --frozen-lockfile` result:
- typecheck/lint/format/build result:
- relevant DB/migrations/types/fingerprint result:
- auth/authorization/RLS/security-negative suites:
- affected Inventory/ERP integration/UAT results:
- existing W0 regression and 23 legacy Frappe DocType checks:
- PR base branch / current HEAD:
- CI workflow/run ID(s), actual tested HEAD and merge-ref relationship:
- CI evidence storage and retention:

## Reviewer approvals
- Independent specialist ChatGPT verdict(s) / chat identity / reviewed code and diff / exact HEAD / timestamp:
- Required architecture/security/DB/Inventory/ERP specialist sign-offs, findings and evidence:
- Reviewer disagreements / risk-owner resolution / mandatory re-review status:
- Native GitHub approval gate: verified REQUIRED / NOT REQUIRED / UNVERIFIED; actual human review URL if required:
- 00 — MASTER final PR APPROVE/REQUEST CHANGES/BLOCKED / SHA / evidence:
- Repository owner merge authorisation and post-merge SHA:
- Blocking threads resolved:
- Any HEAD commit after reviews? If YES, **RE-REVIEW AND RE-RUN**:
- Reviewer conflict of interest / AI session provenance:

## Documentation and operations
- Module business/operational guide:
- ADR/contracts/security docs:
- Limitations/maturity and decision history:
- Migration and data preservation evidence:
- App/DB/ERP API/config compatibility matrix:
- Release/rollback/recovery/compensation:

## DoD checklist — not self-certification
- [ ] DOD-01 All approved ACs evidenced
- [ ] DOD-02 Scope/plan approved
- [ ] DOD-03 Business invariants tested
- [ ] DOD-04 Relevant positive, negative and regression tests
- [ ] DOD-05 Typecheck/lint/build
- [ ] DOD-06 Database/RLS/migration/generated-type checks
- [ ] DOD-07 ERP/Inventory/legacy authority preserved
- [ ] DOD-08 Docs/ADR/handover complete
- [ ] DOD-09 CI reachable and passing for current HEAD
- [ ] DOD-10 Independent technical review current
- [ ] DOD-11 Required specialist sign-off current
- [ ] DOD-12 Verified native-GitHub approval gate and eligible separate human APPROVE **if enforced**; otherwise evidence-backed NOT REQUIRED
- [ ] DOD-13 No blocking review issues
- [ ] DOD-14 Release/recovery impacts documented
- [ ] DOD-15 Requirement→AC→test→CI→HEAD evidence linked
- [ ] DOD-16 00 — MASTER final PR approval at HEAD and owner merge authorisation; actual merge SHA recorded after merge
- Non-waivable blockers or remaining exceptions:
- Final merge operator and merged SHA (post-merge):
