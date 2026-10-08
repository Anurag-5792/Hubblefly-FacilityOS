# R1-08 — Reviewer and GitHub Platform Prerequisites

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Package:** R1-08 — Ownership and reviewer prerequisites, MASTER-approved Option B.  
**Source:** MASTER-approved R1 SDLC Governance Design v1.2, 8 October 2026; historic v1.1 technical provenance.  
**Baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`.  
**Status:** Documentation implementation awaiting R1-09 independent review and MASTER exact-HEAD acceptance. No CODEOWNERS/GitHub configuration authorisation.

## Factual evidence and responsibility

| Prerequisite | Current observed result (8 October 2026) | Impact |
|---|---|---|
| Repository owner | Public repository metadata identifies personal GitHub account `Anurag-5792` | A single owner account is not evidence of an independent approving reviewer |
| Implementing workstream | Chat 15 — Documentation, Handover & Release Governance | Not eligible to independently approve own work as technical reviewer |
| Independent assigned reviewer | Chat 08 — FacilityOS Canonical Architecture, ADRs & Contracts | Needs read-only actual-code/diff/CI investigation at exact R1 PR HEAD |
| Final programme PR authority | 00 — MASTER | Must explicitly independently APPROVE exact HEAD prior to owner merge |
| GitHub branch metadata | `rebaseline/sdlc-v1` observed `protected=false`; rulesets collection `[]` | Not independently conclusive of classic branch-protection settings |
| Classic protection endpoint | `403 Resource not accessible by integration` | **UNVERIFIED** by this connector; owner-authoritative verification necessary before merge |
| Eligible separate GitHub human reviewer | Not verified in available evidence | Verify identity, invitation/permission/write-access, separation **only if** native GitHub approval actually enforced; otherwise record NOT REQUIRED |
| CODEOWNERS/team accounts | None created or configured under R1 | R2 owns verification and configuration; do not invent team or handles |
| Evidence custodian/retention | PR/issues and programme evidence under Workstream 15; U-09 retention/access final decision still open | Preserve review records and export expiring CI artifacts as needed |

## Platform native-approval classifications

- **REQUIRED:** verified real branch rules/protection demand native GitHub approval. A *different* eligible human account must post an actual current valid GitHub APPROVE event, with a review URL. Missing eligible account -> BLOCKED.
- **NOT REQUIRED:** repository owner/admin verifies no configured requirement, retaining dated evidence. Record NOT REQUIRED (never a fictitious APPROVE). Independent AI specialist reviewers and MASTER remain mandatory programme acceptance.
- **UNVERIFIED:** missing owner-authoritative branch/protection settings or contradictory findings; **BLOCK merge**. The connected GitHub app's 403 is not proof protections are absent.

## Independent specialist ChatGPT evidence prerequisites

Reviewing Chat 08 must be distinct from implementing Chat 15, inspect actual repository files and PR patch for full source HEAD, base SHA, synthetic merge SHA/parents, workflow run/job terminal conclusions, AC matrix, security and architecture assertions. Required verdict is APPROVE / REQUEST CHANGES / BLOCKED with findings, exact HEAD and reviewed scope. Same prompt/model role labels in implementing session are not independent. Any later HEAD commit invalidates reviewer verdicts, CI current-head acceptance and MASTER decision.

## Standing U-01 through U-10 external decision record

## 14. External decision and prerequisite register U-01 to U-10

| ID | Standing decision/prerequisite at v1.2 | Owner/evidence required | Actual gate |
|---|---|---|---|
| **U-01** | OPEN — `main` adoption/branch cutover | MASTER/R2 authorisation | No silent `main` merge |
| **U-02** | CONDITIONAL — eligible independent human GitHub approvers not yet verified; not always mandatory | Repo owner verifies accounts/write eligibility **when actual GitHub configuration requires native review**; otherwise records evidenced NOT REQUIRED | Blocks merge only when enforced or platform state unverified |
| **U-03** | OPEN for R2 — branch ruleset counts and roles | MASTER/R2; programme requires independent specialist reviews and MASTER final PR decision now | Blocks future enforcement detail, not independently reviewed R1 policy |
| **U-04** | MASTER DECIDED Option B — R1 ownership policy only; R2 CODEOWNERS | R1-08 prerequisite register plus later R2 verified handles | No CODEOWNERS file required for R1 deliverable |
| **U-05** | OPEN — actual merging method/bypass controls | Owner/MASTER and R2 enforcement plan | Before any merge, use authorised method without bypass |
| **U-06** | Target `src/modules/` frozen; existing path reconciliation OPEN | Architecture/R4 migration mapping | Not an R1 restructuring task |
| **U-07** | OPEN — eight-workflow PR reachability and later required-check naming | Separately authorised CI-BOOT-01 and post-merge canary; R5 consolidation later | Blocks R1 merge until bootstrap evidence accepted |
| **U-08** | OPEN — hosted environment/ERP API/backup/PITR/restore truth | Platform/ERP release owners | Blocks production readiness, not governance documents |
| **U-09** | OPEN — evidence-retention period, access/custody/archiving | MASTER governance decision | Evidence must remain durable; policy finality tracked |
| **U-10** | MASTER DECIDED — Option B mandatory R1-08 deliverables | Recorded MASTER decision and R1-08 artifacts | No Option A/B scope ambiguity remains |

U-02 is **conditional on a real enforced GitHub native-approval rule**; its absence must not be described as proof of a native approving review or be used to waive actual protections. Distinct independent specialist AI chats are always required for programme acceptance.

**Option B is fully implemented as documentation only when this prerequisite register is truthfully maintained.** No invitation, collaborator grant, CODEOWNERS entry or protection rule is implied or authorised. R1-09 actual-code independent review, MASTER PR acceptance and repository-owner merge remain separate later gates.
