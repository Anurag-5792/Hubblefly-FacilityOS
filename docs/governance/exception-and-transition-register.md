# Procedural Exceptions and Transitional Risk Register

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-03  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## Exception request: mandatory record

| Field | Required value |
|---|---|
| Exception identifier | EXC-YYYY-XXXX, maintained in approved programme tracker |
| Type / control | Named **waivable procedural** control; explain why non-waivable requirements are unaffected |
| Source | Approved issue, design, branch, exact 40-char commit SHA, PR |
| Cause / scope / period | Factual root cause, smallest permitted deviation, start and expiry |
| Impact | Security, Inventory, ERPNext ledger, DB, legacy, recovery, evidence |
| Compensating controls | Reproducible evidence and test or hold |
| Decision | MASTER or designated authorised human, approval URL/time |
| Validation | Independent reviewer challenge and final evidence |
| Closure | End time, owner, record of normal-control restoration |

**Decision states:** REQUESTED / APPROVED (with expiry) / REJECTED / EXPIRED / CLOSED. A pending exception is not approval. The initial CI-BOOT-01 exception is historical and never applies to BOOT-AC-06 or later R1 documentation PRs. A failed check/test/security control is non-waivable. Any new programme policy change requires explicit MASTER decision.

### Non-waivable examples and escalation

Do not exception-waive missing MASTER authorisation, independent specialist review, actual required GitHub approvals, exact-HEAD verification, default-deny/SoD/RLS privilege checks, physical inventory quality and posting gates, stock-ledger exclusivity, direct ERP DB write prohibition, legacy/audit preservation or production deployment authority. Record `BLOCKED` and escalate to MASTER instead.

## Transition register inherited from approved Design v1.2

## 13. Transition register and risks

| Transition/risk | Disposition |
|---|---|
| Stale `main`, trusted rebaseline elsewhere | No implicit main cutover; R2/Master decision required |
| `sync-frappe-deploy.yml` force-push deployment mirror | Document as legacy transitional exception, do not change in R1; R2/R3 review operational safety |
| No rulesets / current branch protection admin state unverified | R2 admin-based verification and separate enforcement |
| Existing W0 package workflows overlapping | Preserve accepted gates; CI-BOOT-01 only reachability; R5 consolidation |
| `src/domains/` plus target `src/modules/` | `src/modules/` target remains selected; R4 reconciles without R1 moves |
| 23 legacy Frappe DocTypes and migration assets | Maintain regression and no deletion |
| ERP posting/physical-stock split | Enforce explicit authority and reconciliation declarations |
| No formal immutable GitHub Releases | R1 policy only; R2/release implementation later |
| Hosted Supabase/backup/ERP API production truth unknown | Block production-ready certification, not this design publication |
| Insufficient specialist reviewer independence or unknown enforced GitHub reviewer accounts | Block technical acceptance and, if approval enforced, merge; R1-08 Option B policy still mandatory |

### Live-repository transition observations (evidence-limited)

- `.github/workflows/sync-frappe-deploy.yml` has legacy deployment-branch force-push behaviour; **do not modify or trigger under R1**. It is a documented transition hazard requiring a later authorised assessment.
- `src/domains/` and `app/lib/` exist alongside the target `src/modules/` layout; **R4** performs controlled structure/doc reconciliation. Do not rename under R1.
- Existing overlapping W0 CI gates were preserved by CI-BOOT-01; **R5** handles later consolidation after equivalent-or-stronger coverage.
- Hosted Supabase/backup/ERPNext API version and disaster-recovery capability remain unverified for production-readiness claims.
- Retention duration and custodian/access policy U-09 must be frozen by MASTER; preserve material evidence and export expiring CI artifacts before their TTL.
