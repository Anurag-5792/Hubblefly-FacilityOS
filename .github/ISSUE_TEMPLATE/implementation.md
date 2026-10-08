# Implementation Issue: <capability and bounded change>

## Authority and readiness
- Requirement ID / permanent link:
- Product/business objective; operational pain; business value:
- Users/actors and operational lifecycle:
- Approved design/ADR/version:
- MASTER/delegated design decision and implementation authorisation:
- Workstream/package:
- Trusted base branch and exact 40-char SHA:
- Implementer:
- Required independent technical reviewer:
- Specialist reviewer(s) and reason:
- Independent specialist ChatGPT reviewing chats and exact-source review assignment:
- GitHub native-approval requirement: REQUIRED / NOT REQUIRED / UNVERIFIED, verified config evidence:
- Eligible real GitHub approving human **only if enforced** (otherwise NOT REQUIRED):
- 00 — MASTER final programme PR authority:
- DoR decision (READY FOR IMPLEMENTATION / NOT READY / BLOCKED):
- DoR decision-maker, date, evidence link:

## Scope
### In scope
### Explicitly out of scope
### Dependencies and blockers
### Operational users, failure modes and interfaces

## Source-of-truth impact (never leave blank)
- FacilityOS-native operational truth and authoritative tables:
- Physical location/container/serial/batch truth:
- Quality disposition: Accepted / Rejected / Hold / Return / Not affected
- Reservation, kitting, issue and consumption truth:
- ERPNext official stock ledger/valuation effect: NONE / READ / API WRITE
- ERP document/API, mapping and approval, if any:
- ERP posting eligibility vs requested vs successful posting:
- Reconciliation, idempotency and failed-posting handling:
- Legacy Frappe/reference-data impact and migration need:

## Mandatory Inventory lifecycle declaration
- [ ] No Inventory impact — rationale:
- [ ] Inward / Operational GRN
- [ ] IQC / Accepted / Rejected / Hold / Return
- [ ] Storage / Rack / Position / Container / QR
- [ ] Movement / reservation / kitting
- [ ] Issue / consumption / return
- [ ] Count / reconciliation / adjustment
- [ ] Serial / batch / genealogy / traceability
- [ ] ERP posting eligibility / ERP transaction
- [ ] MIS / reporting freshness
State transitions, required roles, immutable evidence and prohibited transitions:

## Security, migration and dependencies
- Authentication / actor source:
- Capabilities / scope / SoD / approval gate:
- RLS and role / SECURITY DEFINER consequences:
- Sensitive fields, secrets, network boundaries:
- Migration IDs, backfill, compatibility, restore:
- New dependency / version / licence / security advisories / lockfile impact:

## Acceptance criteria: stable IDs and proofs
| AC ID | Business/domain invariant and observable expected behaviour | Positive/negative case | Required test/evidence | Reviewer |
|---|---|---|---|---|
| AC-01 | | | | |
| AC-02 | | | | |

## Verification plan
- Unit:
- Integration / PostgreSQL / RLS:
- Security-negative / privilege escalation:
- ERPNext sandbox/idempotency/reconciliation:
- Inventory state/quality/SoD tests:
- Existing W0 regressions / legacy structural checks:
- UI/E2E/UAT if applicable:
- CI-reachability and exact-HEAD evidence path:

## Documentation, operations and release
- Module guide business vision/value/workflow and status:
- Architecture/security/ADR changes:
- Runbook / support / known limitations:
- Application/schema/ERP API/config compatibility:
- Deployment/rollback/recovery implications:

## Full DoR evidence — all must be assessed
- [ ] DOR-01 Approved requirement and design
- [ ] DOR-02 In/out scope bounded
- [ ] DOR-03 Stable AC IDs / objective evidence
- [ ] DOR-04 Dependencies identified
- [ ] DOR-05 Exact base SHA
- [ ] DOR-06 System-of-record ownership identified
- [ ] DOR-07 Inventory lifecycle, dispositions and truth dimensions
- [ ] DOR-08 IAM/RLS/security/SoD impact
- [ ] DOR-09 Data/migration/legacy impact
- [ ] DOR-10 AC-to-test plan including negatives
- [ ] DOR-11 Documentation/ADR effect
- [ ] DOR-12 Release/rollback/recovery effect
- [ ] DOR-13 Independent specialist ChatGPT review roles, MASTER final authority, and verified conditional GitHub-native reviewer requirement
- [ ] DOR-14 No blocking decisions left unresolved
- [ ] DOR-15 Explicit implementation authorisation
- Missing/blocked item and owner:
- Waiver reference if applicable (no ordinary non-waivable waiver):
