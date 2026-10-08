# Programme Authority, Maturity and Phase Boundaries

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-01  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## 1. Evidence, authority and inherited baseline

### 1.1 Authority order

1. MASTER-accepted programme scope, decisions and freezes.
2. Accepted canonical FacilityOS architecture, contracts and ADRs.
3. Approved bounded requirement/design and named implementation authorisation.
4. GitHub issue with Definition of Ready and implementation plan.
5. Exact-code implementation, independent review, specialist assessment and current-head CI evidence.
6. Release, deployment and operational acceptance evidence.

A chat instruction, green CI result, PR approval or tracker label cannot override a higher-level authority. R1 design approval is distinct from authorising R1 file changes, and both are distinct from production release authorisation. Durable decisions must be reflected in controlled records. Operating convention: **Chat decides → Notion documents → ClickUp executes → GitHub implements → MASTER tracks**, subject to accepted record/architecture authority when sources diverge.

### 1.2 Frozen baseline and verifiability

Accepted R0-01 audit/rebaseline established: W0-01 to W0-08 **TESTED**, not automatically deployed or production verified; W0-09 preserved as salvage, not authorised to continue; W0-10 onward unauthorised. `main` is not assumed to be the trusted rebaseline branch. `rebaseline/sdlc-v1` at the SHA above is the implementation comparison baseline. The repository contains target Next.js/TypeScript/PostgreSQL components alongside legacy app/lib and Frappe code. The legacy `frappe_app/` is preserved; historical Frappe-target architecture is superseded, not erased.

The independent review recorded no repository rulesets or Releases, no CODEOWNERS or standard issue/PR templates at the trusted baseline, and only the personal GitHub identity `Anurag-5792` exposed through available account access. Branch-protection API truth was not directly verifiable by the review connector; R2 must reverify with admin access. The legacy `.github/workflows/sync-frappe-deploy.yml` contains force-push deployment-branch behaviour and is a **transition exception requiring assessment**, not an acceptable pattern for new protected branches.

### 1.3 Implementation status versus workflow gates

Canonical product/package maturity vocabulary remains **DESIGNED / PLANNED / IMPLEMENTED / TESTED / DEPLOYED / PRODUCTION VERIFIED / SUPERSEDED / BLOCKED**. **READY FOR IMPLEMENTATION** is an *SDLC issue gate*, not an additional maturity status. PR open/approved/merged and release/deployment status are separate dimensions. No success in one dimension implies success in another.

### 1.4 MASTER final PR authority — 8 October 2026 decision (v1.2)

**00 — MASTER is final programme PR acceptance authority.** The implementing chat authors and tests. Separate specialist ChatGPT chats independently inspect real source/PR diffs, tests, contracts, architecture and security at the exact full PR HEAD SHA; each records `APPROVE / REQUEST CHANGES / BLOCKED` and factual evidence. MASTER independently evaluates those technical verdicts together with CI, requirements, risk and open findings; only an explicit MASTER acceptance permits the repository owner to consider merging. The owner performs the actual GitHub merge only when the platform's applicable rules and the MASTER decision are both satisfied.

A specialist AI report is **valid programme technical-review evidence** but **not a GitHub-native `APPROVE` event**. A separate eligible human GitHub reviewer account is required **if and only if** the repository's actual applicable protection/ruleset or independently frozen mandatory GitHub-review requirement enforces a native approval. When no such rule applies, programme review may rely on independent AI specialist reports, current-head GitHub CI and MASTER acceptance; record `GitHub-native approval: NOT REQUIRED BY VERIFIED CONFIGURATION`, never `APPROVED`. Unknown/unverifiable protection settings are `UNVERIFIED` and prohibit asserting that approval is optional. Neither MASTER nor an AI reviewer may bypass a configured GitHub restriction.

**Precedence:** This later explicit MASTER authority decision controls earlier v1.1 wording that always demanded an independent human GitHub `APPROVE` regardless of configuration. It does not relax independent technical scrutiny, specialist competence, exact-SHA revalidation, verified CI, separation from the implementing chat, legal security/stock rules or repository protections.

### Updated implementation reference after the approved CI-BOOT-01 merge

The accepted integration baseline for this R1 documentation change is frozen **S_BOOT 46d2d74c8744ac7d4949604cdd3b7a0466d22e37**, not the original S0. Historical source-version statements in Design v1.2 do not move the implementation base. A published governance policy is not permission to execute an operational change.

## 11. R1 versus R2–R6 boundary freeze

| Phase | Work allowed only under that phase's separately granted authority |
|---|---|
| **R1** | Governance docs, standards, DoR/DoD, issue/plan/PR templates, review/evidence semantics, **Option B ownership policy and prerequisite register only**, release/recovery policy. **No CODEOWNERS file in R1**. |
| **R2** | Branch protection, rulesets, reviewer/required-check enforcement, merge controls, branch/release enforcement, bypass controls, GitHub permissions/operations. |
| **R3** | Classified KEEP / REFACTOR / MIGRATE / ARCHIVE / REMOVE cleanup, with evidence and approval. |
| **R4** | Target architecture/document structural reconciliation, including migration of existing `app/`, `lib/`, `src/domains/` toward **already selected** target `src/modules/`. Target root is not reopened. |
| **R5** | CI/test consolidation, workflow redesign and equivalent-or-stronger gate coverage. |
| **R6** | W0-09 salvage assessment; classify components KEEP AS-IS / PORT / REWORK / DROP; controlled reintroduction only by later specific approval. |

**Acceptance of R1 policy authorises none of the operational controls it describes.** No R1 work may implement feature code, move modules, change production DB/ERPNext, configure Vercel/Supabase production, delete legacy assets, merge to `main`, start W0-09 or W0-10, enable GitHub rulesets, or consolidate tests. CI-BOOT-01 is a separately **to-be-authorised** prerequisite with its own one-time review/CI reachability exception, not automatic R1 permission.

### Actual approval and status separation

An implementing chat never self-approves as an independent reviewer. Independent specialist ChatGPT sessions return APPROVE / REQUEST CHANGES / BLOCKED based on actual current-HEAD code. MASTER makes the final programme PR acceptance decision. GitHub-native approving review is a distinct, conditional platform event, not an AI review report. Owner merges only after MASTER and verified platform gates; each merge results in a separately recorded integration SHA.

Product maturity: DESIGNED / PLANNED / IMPLEMENTED / TESTED / DEPLOYED / PRODUCTION VERIFIED / SUPERSEDED / BLOCKED. READY FOR IMPLEMENTATION is a DoR issue gate only.
