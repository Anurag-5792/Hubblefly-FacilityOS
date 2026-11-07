# HFT R1 — Operational-first Stores release gap matrix (OPS-014)

**Directive:** `HFT-R1-MASTER-V4-OPERATIONAL-FIRST-014`  
**Assessment baseline:** `b7192aebc52d14063cf78317a7eba8ce6d18ae4a` (4 November 2026).  
**Mode:** nonproduction source engineering and delivery planning.  
**Gate R:** HOLD. **Gate A:** HOLD. **Production:** NO-GO.  
**PR:** #11 draft, unmerged. No operational completion percentages or
replacement production dates are authorized.

## A. Bounded minimum first-operational release

A workflow is **operational** only after real online HFT application → qualified
PostgreSQL authority → independently approved operation → durable commit →
independent balance/identity/audit readback. A synthetic SQL stub, Next build,
browser-only form, source-approved ADR or disposable DB experiment cannot
establish this.

Statuses below:
- `SOURCE_INTEGRATED`: frontend/service source is present, NOT live-qualified.
- `SOURCE_ONLY`: pure validators, mocked PG protocols or nonexecuted SQL.
- `BLOCKED`: explicit throw/503, missing necessary writer or authority.
- `NOT_IMPLEMENTED`: no integrated workflow serving the requirement.
- `EXTERNAL_HOLD`: provider, personnel, protected DB, recovery or production
  qualifications have not been authorized or independently accepted.

| Required operational function | Exact existing source evidence | Current disposition | Missing engineering / release proof | Next bounded package |
|---|---|---|---|---|
| Authenticated Employee Master | `app/stores/masters/page.tsx`, `lib/hft/ui-reuse/EmployeeMasterDirectory.tsx`; signed `app/api/hft/masters/route.ts`; `lib/hft/masters/p3-service.ts`; `app/stores/masters/approvals/page.tsx` | SOURCE_INTEGRATED; review SQL NOT RUN | Qualified P3 runtime/approver identities, live CREATE/EDIT/ACTIVATE/DEACTIVATE, stale-scope, immutable audit, dual-person acceptance | OPS-B: P3 acceptance |
| Item, product version and mandatory photographs | `lib/hft/domain/item-version-photo.ts`; `lib/hft/masters/p3-item-gallery.ts`; `app/stores/items/[itemCode]/page.tsx`; `db/security/HFT-R1-ITEM-VERSION-PHOTOS-REVIEW.sql` | SOURCE_ONLY; photo intake NOT_IMPLEMENTED | Approved complete version census including retired, HFT-owned photo intake and bytes/hash/rights verification, independent approval and replacement, qualified storage ACL/media readback | OPS-B: item/photo |
| Supplier, warehouse and physical location identity | Canonical `db/migrations/0001_hft_masters.sql`; `lib/hft/masters/p3-contract.ts`; `lib/hft/domain/physical-location-count.ts`; P3 review SQL | SOURCE_ONLY | Independent approve/apply for ITEM/SUPPLIER/WAREHOUSE/LOCATION (P3 currently Employee-only decision); certified leaf hierarchy, active/scope FK tests and revisions | OPS-B + OPS-E |
| Supplier invoice, GRN and QC | `lib/hft/domain/grn.ts` (nonposting); `db/migrations/0003_hft_workflows.sql`, `0005_hft_quantitative_accounts_receipts.sql`, `0006_hft_posted_fact_integrity.sql`; `p0-operations.ts` IN | SOURCE_ONLY / workflow INCOMPLETE | Genuine invoice and receipt registration, QC/test authority and evidence, invoice-to-GRN partial quantity, duplicate invoice/receipt and over-receipt prevention through protected DB | OPS-C |
| Stock IN | `app/stores/operations/page.tsx`; `app/api/hft/stores/submit/route.ts`; `lib/hft/stores/p0-persistence.ts` | BLOCKED even under candidate SQL | `db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql` `p0_resolve_authorized_stock_v1` unconditionally raises `P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED`; version-aware P2 writer, provenance, approval, serial/batch and exact destination leaf | OPS-A then OPS-C/D |
| Employee stock OUT | Same P0 route/persistence; `lib/hft/persistence/protected-stock-posting.ts`; P2 review SQL | BLOCKED by same version-coupled resolver | Authorized employee / issue document, balance deduction and custody creation, ACK_PENDING + independent acknowledgement, insufficient quantity and cross-scope rejection | OPS-A then OPS-D/F |
| Physical COUNT | `lib/hft/domain/physical-location-count.ts`; `lib/hft/stores/p0-persistence.ts` `appendCount`; review-only `hft.p0_append_count_observation_v1` | SOURCE_ONLY (SQL not installed) | Verified frozen version-aware per-bin snapshot/epoch, counter qualification, certified path, immutable observations, duplicate serial prevention, variance reconciliation; count alone NEVER posts an adjustment | OPS-E |
| Between-bin TRANSFER | P0 TRANSFER form/validator, `prepareLocationTransfer`; `submitP0Stores` rejects `P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION` | BLOCKED | Atomic, balanced source/destination movement in the ONE protected ledger, exact item version/location/serial and custody, idempotency and audit; cannot implement via RECEIVE+ISSUE workaround | OPS-D |
| Employee return, condition, custody and acknowledgement | `lib/hft/domain/ledger.ts` RETURN pure model; `db/migrations/0003_hft_workflows.sql`; `db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql` RETURN inspection/ACK policies | SOURCE_ONLY / P0 RETURN UI+API NOT_IMPLEMENTED | Governed return command/service mapping to original ISSUE fragment, inspection and quarantine, restored account and custody, independent ACK exception resolution | OPS-F |
| Opening stock and cutover | `lib/hft/domain/opening-stock.ts` nonposting reconciliation; canonical `opening_count_session`/`opening_count_line` | SOURCE_ONLY | Physical opening census per exact site, warehouse, bin, version, serial/batch; historical movement reconcile; one-time independent approval and cutover; prevent duplicate opening balances | OPS-E then external cutover |
| Actual balances, movements and employee custody readback | `app/api/hft/stores/read/route.ts`; `lib/hft/stores/p0-readback.ts`; `p0_read_authoritative_stores_v1` SQL candidate | BLOCKED even under candidate SQL | SQL function unconditionally raises `P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED`; version-coupled account/custody projection, strict scoped serial/bin, independent reconciliation and pagination | OPS-A then OPS-D |
| Independent approval, Holds and immutable audit | Canonical `0002_hft_ledger.sql`, `0004_hft_posting_authority.sql`; protected P2/P3 review SQL and signed service proofs | SOURCE_ONLY; EXTERNAL_HOLD | Approved exact human/person enrollment, policy/role revocations, maker-checker denial, immutable action provenance and real SQL ACL/RLS/denied DML tests | OPS-A/B/C + external security/governance |
| Rollback, duplicate prevention and uncertain COMMIT | `lib/hft/persistence/protected-posting-transaction.ts`, `protected-stock-readback.ts`; canonical command/entry/seal constraints; scripted Node tests | SOURCE_ONLY, NOT LIVE-QUALIFIED | Actual concurrent serial/outbound races, idempotency and failed transaction rollback in isolated online PG18.6; no blind replay after ambiguous COMMIT; verified audit reconstruction | OPS-A/D and external QA |
| Online application and runtime authorization | `middleware.ts` production deny and HFT API 503; `lib/hft/persistence/online-pg-transport.ts`; `tools/hft_online_db_preflight.mjs` | BLOCKED intentionally | Approved online TLS endpoint, non-owner runtime identities and privileges, secrets, server-side RBAC, production release guard transition under separate MASTER approval | External Gate R/Gate A |

**Two hard source blockers** (not just missing live tests):
`p0_resolve_authorized_stock_v1` and
`p0_read_authoritative_stores_v1` are rejecting stubs in the
NONEXECUTABLE P0 SQL candidate. A new SQL installation alone is NOT a
functional IN/OUT/readback solution.

## B. Minimum operational source packages (dependency order)

1. **OPS-A — Canonical version-coupled stock authority/readback.** Design and
   independently review a *prospective* forward-only protected P2/P0 SQL
   correction (never amend migrations 0001–0006). Bind item/version, physical
   leaf, serial/batch and custody/account identities, seal and audit. Replace
   the two deliberate rejecting P0 stubs only after acceptance of exact
   protected SQL, source signer, role ACL and transaction contract. No second
   stock ledger or ungoverned table DML. **This is the primary critical path.**
2. **OPS-B — Governed masters + photo identity.** Reuse C050 Employee UI and
   P3 contracts. Complete independent decision/apply for remaining master
   kinds, certified warehouse/leaf hierarchy and HFT media intake/rights,
   version census, durable photographs and approval. No direct donor source
   transfer without documented publication rights.
3. **OPS-C — Real supplier invoice/GRN/QC.** Source UI and restricted APIs for
   registered invoice line, verified supplier, GRN and partial receipt,
   independent QC acceptance, one authoritative receipt identity, negative
   overage/duplicate/rejected-QC tests.
4. **OPS-D — IN, OUT, TRANSFER and authoritative readback.** Extend the same
   protected PostgreSQL writer for audited balanced transfers and scoped
   version-aware readback. Bind approved IN/OUT sources to real accounts,
   exact leaf identities and human/custody authority. Run scriptable
   HTTP-to-function-to-commit-to-readback tests. Preserve idempotency, lock
   ordering and uncertain-COMMIT no-retry.
5. **OPS-E — COUNT, physical locations and opening-stock.** Frozen
   version-aware count epochs, certified hierarchy, signed independent
   counter authority, immutable observations and variance readback; separate
   independently approved adjustment/cutover authority. Opening stock must
   never double count historic posted receipts.
6. **OPS-F — Employee RETURN and custody closure.** Governed original issue
   linkage, partial return, independent repair/inspection disposition,
   employee ACK events/exceptions, serial/batch handoff and real scoped
   readback. RETURN is mandatory for R1; not an optional later feature.
7. **OPS-G — Online release qualification (separate external execution
   authority).** Approved migrations and reviewer evidence, independent
   online PostgreSQL authentication/ACL/RLS qualification, concurrent/negative
   tests, real browser/mobile journeys, independently witnessed restore,
   rollback, opening cutover and audit, exact source-bound Gate R/Gate A and
   production acceptance. No calendar claim or automatic promotion.

Work on A and B/C source contracts may proceed in parallel, but D/E/F cannot
be accepted until their shared A authority is qualified. External G is a
hard authorization boundary; passing CI cannot cross it.

## C. Minimum positive / negative acceptance

- Authenticated scoped Employee and all master CRUD **requests**; genuine
  independent decision/apply and immutable revision/audit readback; denied
  self-approval, stale actor/scope and cross-warehouse actions.
- Version/photo census including retired versions, each with an approved
  HFT-owned PRIMARY photo and verified bytes/rights; wrong-version,
  unapproved/duplicate images denied.
- Supplier invoice → GRN line → QC → partial IN; exact doc/line/receipt keys;
  duplicate invoice/GRN and over-receipt, pending/rejected QC denied.
- IN and OUT adjust versioned exact-location balances atomically, with
  serial/batch and employee custody; insufficient stock and duplicate command
  denied. Capture immutable original/readback facts and ACK_PENDING.
- COUNT uses one frozen epoch and independent counter; cannot post stock on
  its own. Conflicting serials/epochs and unqualified locations denied.
- TRANSFER is one atomic, balanced source→destination ledger transaction,
  not a pair of unrelated IN/OUT postings; failed second leg rolls back both.
- RETURN limited by original ISSUE remaining quantity, independently
  inspected, with custody and ACK exception transitions audited; wrong
  employee, wrong serial, negative balance and self-inspection denied.
- Opening physical reconciliation proves no double counting on cutover.
- Race/rollback/nonce/replay/uncertain-COMMIT, revoked authority and expired
  signatures are tested on genuine online PG and browsers. Audit facts remain
  immutable, backup/restore are witnessed and independently qualified.

## D. External gates / no unauthorized execution

- **Chat 10 Security / Chat 11 Governance / Chat 17 QA:** source review of
  exact P2/P3 and IAM/approval extensions plus real negative tests.
- **Chat 13 Recovery and PG provider:** PG18.6 reference/provider census,
  online staging database identity and effective runtime ACL, actual
  backup/restore fidelity and witnessed Recovery Gate R.
- **MASTER Gate A:** separately authorized migration execution and
  source-bounded human approval with protected evidence, exact pins and
  operation scope. No application code may issue this automatically.
- **Operations:** physical location/master data, genuine employee and
  supplier invoice/GRN evidence, inspection and opening count/cutover
  reconciled and independently accepted.
- **Production:** web/app TLS, secrets, online DB segregation, rollback,
  deployment controls and browser/mobile workflows actually tested.

At the baseline, the six S0–S5 pins, review/execution/catalog pins and
recovery collector/witness trust pins all read **HOLD**. The Recovery V2
source identity remains version-pinned and unchanged. Do NOT populate pins
or run SQL on the basis of this document or its read-only preflight.

## E. Reuse and post-pilot backlog

**Allowed in currently authored HFT source:** C050 Employee Directory and
OWNER proposal-only UI; `hrms-employee-source.ts` read-only SBAI/AIMIS
candidate mapping; P1/P2/P3 HFT domain contracts. Existing donor
design patterns can be used after independent HFT adaptation/testing.

**Future direct private donor source:** require rights and publication
authority, then COPY → ISOLATE → ADAPT → TEST → INTEGRATE → VERIFY with
exact donor commit/file SHA and restricted original, without any external
runtime stock, HR or auth dependency. Drone-Destination SBAI/RPTO,
Monorepo, Survey-Mapping, AI-MIS, warehouse, inventory and QR assets remain
candidates, not operational integrations.

**Post-pilot enhancements, separate controlled releases:** advanced MIS and
forecasting, manufacturing/shopfloor/WIP automation, convenience dashboards,
cross-company ERPNext Phase 2 and DD MRO separately. QR scanner and label
printing are enhancement candidates **only if** the pilot operational SOP
accepts manual, independently checked item/version/serial/bin identity; if
QR is a mandatory physical control, it remains a pilot acceptance blocker,
not something automatically deferred.

## F. Source-only machine check (never release authorization)

`python3 tools/hft_r1_operational_readiness.py --json` reports current
blocking source identities, SHA-256, all 11 protected HOLD indicators and
outstanding external qualifications. It only reads local source. **Its
result is permanently NO_GO**; even if a stub or HOLD is modified, the
result becomes `SOURCE_CHANGED_INDEPENDENT_REQUALIFICATION_REQUIRED`, not
"APPROVED". It neither accesses the provider nor grants migration/production
authority. Python unit tests assert this fail-closed semantics.

**Delivery decision:** Operational pilot cannot proceed before A–G and
independent source, database, recovery and production acceptance. This
document is a bounded nonproduction planning artifact, not a live acceptance
record.
