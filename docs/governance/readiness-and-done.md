# Definition of Ready, Definition of Done and Non-Waivable Controls

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-03  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## 4. Normative SDLC workflow and gates

`Requirement → bounded design → MASTER implementation authorisation → GitHub issue/READY gate → plan and exact base SHA → authorised implementation chat/branch → code and tests → PR + actual-source/diff evidence → current-HEAD GitHub CI → independent specialist ChatGPT reviews (each APPROVE / REQUEST CHANGES / BLOCKED) → conditional GitHub-native approval (only if actually enforced) → 00 — MASTER independent final PR acceptance → repository owner performs compliant merge → immutable release → separately authorised deployment → production verification`.

### 4.1 Definition of Ready (DoR)

All applicable requirements must be recorded, not reduced to a shorter checkbox set:

**DOR-01** approved requirement/business problem and decision URL; **DOR-02** bounded in/out scope; **DOR-03** acceptance criteria with stable AC identifiers and observable evidence; **DOR-04** dependency/predecessor decisions; **DOR-05** exact trusted base SHA; **DOR-06** authoritative data facts and FacilityOS-versus-ERP boundary; **DOR-07** Inventory flow, quality disposition and physical/ERP truth impacts; **DOR-08** security/IAM/RLS/SoD impact; **DOR-09** migrations and legacy effect; **DOR-10** realistic unit/integration/security-negative/UAT tests mapped to AC IDs; **DOR-11** documentation and ADR impact; **DOR-12** release/rollback/recovery impacts; **DOR-13** named independent specialist ChatGPT reviewer roles/sessions, MASTER decision authority, verified GitHub platform requirements and any required eligible human GitHub reviewer; **DOR-14** blocking decisions resolved; **DOR-15** required implementation authorisation explicitly recorded. Gate outcome: `READY FOR IMPLEMENTATION`, `NOT READY`, or `BLOCKED`—this is not a new implementation maturity status.

### 4.2 Definition of Done (DoD)

**DOD-01** approved ACs evidenced; **DOD-02** scope conforms to issue/plan and deviations accepted; **DOD-03** tests assert domain invariants, not just passing counts; **DOD-04** unit/integration/regression and relevant security-negative checks pass; **DOD-05** typecheck/lint/build; **DOD-06** schema/migration/generated-type/RLS evidence where applicable; **DOD-07** legacy preservation and ERP/inventory boundary evidence; **DOD-08** docs, ADR and handover complete; **DOD-09** exact current-head CI evidence; **DOD-10** current-head independent technical verdict; **DOD-11** specialist sign-off where required; **DOD-12** verified disposition of GitHub-native approval (actual eligible independent APPROVE if enforced; otherwise documented NOT REQUIRED with platform evidence; if unverified BLOCKED); **DOD-13** unresolved blocking threads closed; **DOD-14** release/recovery implications recorded; **DOD-15** durable issue→AC→test→evidence→PR→SHA linkage; **DOD-16** explicit 00 — MASTER final PR acceptance and owner merge authorisation at the reviewed HEAD; the owner performs the compliant merge subsequently and records its resulting SHA as post-merge closure evidence. Passing DoD grants *merge-readiness*, not deployment or production verification.

### 4.3 Exceptions, waiver and stop rule

Any *waivable process deviation* requires change/control ID, justification, scope and SHA, risk, compensating control, human approver, expiry and closure evidence. MASTER or a formally delegated authority must approve a consequential waiver. **Not waivable by ordinary exception:** explicit authorisation, independent specialist technical review, MASTER final programme decision, actual eligible GitHub approval when enforced, current-HEAD revalidation, security/SoD/RLS isolation, prohibition on direct ERPNext DB writes, no competing ledger masters, mandatory inventory/approval gates, preservation of immutable audit/legacy evidence, and truthful CI/deployment status. Missing requirements produce `BLOCKED`, not automatic closure. Programme-level policy change requires explicit new MASTER decision, never an improvised PR waiver.

## Checklist IDs and evidence applicability

Every DOR-01..DOR-15 and DOD-01..DOD-16 is mandatory to assess. "Not affected" must include a reason and be accepted for the scope; it is not a blanket checkbox waiver. Outstanding blocking decisions imply `BLOCKED`. Evidence records use the current 40-character SHA and permanent issue/PR/CI links.

The issue template mirrors DoR-01..15, and the PR template mirrors DOD-01..16. Before merge, DOD-16 requires the explicit MASTER PR decision at exact reviewed HEAD; the **actual resulting merge commit** is recorded in later post-merge closure, not falsely back-filled before the merge occurs.

## Non-waivable safeguard inventory

No waiver may supersede implementation authority, independent specialist review, MASTER final decision, actual enforced GitHub native approval, HEAD revalidation, authorization/SoD/RLS controls, immutable audit/legacy evidence, ERPNext SQL-write prohibition, Inventory quality/approval restrictions, or truthful CI/deployment reporting. Only procedural deviations with recorded owner, approval, compensations, expiry and scope may be waived. See [exception and transition register](exception-and-transition-register.md).
