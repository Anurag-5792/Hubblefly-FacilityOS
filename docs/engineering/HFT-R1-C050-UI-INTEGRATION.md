# HFT C050 — Bounded Employee and OWNER access UI integration

Directive: HFT-R1-MASTER-V4-C050-INTEGRATION-003
Mode: NONPRODUCTION SOURCE ONLY | Gate R HOLD | Gate A HOLD | Production NO-GO

## Sources and transfer boundary

The C050 prepared package was recovered locally in full (seven original
source/test files). HFT-native source patterns were independently adapted to
the existing FacilityOS P3 contracts. No private cross-company donor source,
donor data, MongoDB/Clerk auth, stock ledger, QR identity or backend writer is
included. The original 42-repository donor dossier remains restricted and
does not belong in this public repository. Source transfer/publication
rights for direct private-donor copies are NOT QUALIFIED.

## C050-01 — Employee Master directory

Existing route only: /stores/masters. The new EmployeeMasterDirectory takes
only a successful response from the existing signed POST /api/hft/masters,
intent=LIST, kind=EMPLOYEE. It normalizes the P3 row shape, verifies the
selected entity/site/warehouse matches each row and only exposes fullName,
department, designation and siteId with record identity/revision/status.
Search and filters operate solely on the returned at-most-50 HFT rows.

"Request edit" fills the existing P3 edit form using exact employee
revision, four approved fields and selected scope. Submission still calls
POST /api/hft/masters with HFT-R1-P3-MASTER-V1, intent=SUBMIT, kind=EMPLOYEE,
operation=EDIT, and requires a PENDING_APPROVAL readback. Independent
approval remains in /stores/masters/approvals. No direct Employee write,
auto-activation or HR designation -> role translation is introduced.
A fresh scope change invalidates previously loaded records and in-flight
responses; the UI never treats client selectors as a permission source.

## C050-02 — OWNER route-access proposal

Existing route only: /stores/masters. No new /admin/access route, IAM API,
role table, SQL grant, protected migration or actual permission writer.
Route registry maps exactly seven existing Next.js page routes. OWNER
visibility is display-only and never grants protected operation authority.

The owner editor produces only PROPOSED_NOT_APPLIED drafts with independently
required review, and its pure model denies self-assignment, unknown/wildcard
permissions, scope drift and stale policy generations. It does NOT have an
authorized role/scope issuer in current HFT source: the production page
passes actor=null and policyGeneration=0 deliberately, so the live editor
is blocked. A caller can render it under synthetic roles for source tests,
but UI props are never server-side authorization.

An approved IAM identity/assignment/revocation/immutable audit backend and
independent human approvals must be qualified separately before live grant
application or role-driven routes are enabled.

## Verification boundary

Source checks: Node models and signed-session scripted P3 LIST/EDIT tests;
actual TSX React render smoke tests using the installed React/TypeScript
dependency stack; whole source workflow with lint, TypeScript and Next.js
build. Synthetic authenticated test fixtures prove source boundaries only,
not live PostgreSQL, browser interactivity, corporate enrollment or RLS.

Protected C041/C047 source and the Recovery V2 source pin are not modified.
No protected SQL migration, IAM table, app deployment, resource operation,
review/approval HOLD or trust pin is changed. Existing full stock authority
and immutable audit contracts remain controlling.

Independent Chat 10 security and Chat 11 governance source review must
evaluate this exact commit before claiming independently verified access.
